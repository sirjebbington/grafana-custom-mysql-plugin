package sqleng

import (
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

const (
	DefaultMaxConnsPerUser    = 5
	DefaultConnMaxIdleTime    = 60 * time.Second // below the ~350s idle timeout of the AWS NLB in front of StarRocks
	DefaultUserPoolIdleExpiry = 10 * time.Minute

	// A token this close to expiry is not used to open new connections.
	minTokenValidity = 10 * time.Second
	sweepInterval    = 30 * time.Second
)

// ErrTokenExpired is returned when the forwarded token is expired or about to expire. Grafana refreshes the
// token before it forwards it, so this normally means IDAM did not return a new token on refresh.
var ErrTokenExpired = errors.New("the IDAM token has expired and Grafana could not refresh it: sign out of Grafana and sign in again")

// ErrPoolManagerClosed is returned after the datasource instance has been disposed.
var ErrPoolManagerClosed = errors.New("datasource instance is closed")

type PoolConfig struct {
	// MaxConnsPerUser caps open connections per user for this datasource.
	MaxConnsPerUser int
	// ConnMaxIdleTime closes connections that have been idle this long.
	ConnMaxIdleTime time.Duration
	// ConnMaxLifetime closes connections this long after they were opened. It is further capped by token expiry.
	ConnMaxLifetime time.Duration
	// PoolIdleExpiry drops a user's pool when it has not been used for this long.
	PoolIdleExpiry time.Duration
}

func (c PoolConfig) withDefaults() PoolConfig {
	if c.MaxConnsPerUser <= 0 {
		c.MaxConnsPerUser = DefaultMaxConnsPerUser
	}
	if c.ConnMaxIdleTime <= 0 {
		c.ConnMaxIdleTime = DefaultConnMaxIdleTime
	}
	if c.PoolIdleExpiry <= 0 {
		c.PoolIdleExpiry = DefaultUserPoolIdleExpiry
	}
	return c
}

// PoolManager keeps one small connection pool per StarRocks user. MySQL authenticates once per connection,
// so a connection belongs to the user whose token opened it and is never shared with another user.
//
// A pool is retired when its token expires, when the user presents a newer token (Grafana refreshed it),
// or when it has been unused for PoolIdleExpiry. A retired pool is closed once its in-flight requests finish,
// so no connection outlives the token that authenticated it by more than one request.
type PoolManager struct {
	mu     sync.Mutex
	base   *mysql.Config
	cfg    PoolConfig
	pools  map[string]*userPool // key: StarRocks username
	closed bool
	stop   chan struct{}
	log    log.Logger

	now    func() time.Time
	openDB func(cfg *mysql.Config) (*sql.DB, error)
}

type userPool struct {
	db       *sql.DB
	token    string
	expiry   time.Time
	lastUsed time.Time
	leases   int
	retired  bool
}

func NewPoolManager(base *mysql.Config, cfg PoolConfig, logger log.Logger) *PoolManager {
	m := newPoolManager(base, cfg, logger)
	go m.sweepLoop()
	return m
}

func newPoolManager(base *mysql.Config, cfg PoolConfig, logger log.Logger) *PoolManager {
	return &PoolManager{
		base:   base.Clone(),
		cfg:    cfg.withDefaults(),
		pools:  map[string]*userPool{},
		stop:   make(chan struct{}),
		log:    logger,
		now:    time.Now,
		openDB: openDB,
	}
}

func openDB(cfg *mysql.Config) (*sql.DB, error) {
	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		return nil, err
	}
	return sql.OpenDB(connector), nil
}

// Acquire returns the connection pool for the identity's user. The caller must call release when it has
// finished using the pool, including reading all rows.
func (m *PoolManager) Acquire(id *Identity) (db *sql.DB, release func(), err error) {
	now := m.now()
	if id.Expiry.Sub(now) < minTokenValidity {
		return nil, nil, ErrTokenExpired
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return nil, nil, ErrPoolManagerClosed
	}

	p, ok := m.pools[id.Username]
	if ok && !m.reusable(p, id, now) {
		m.retireLocked(id.Username, p, "token replaced")
		p, ok = nil, false
	}
	if !ok {
		p, err = m.openLocked(id, now)
		if err != nil {
			return nil, nil, err
		}
	}

	p.leases++
	p.lastUsed = now
	var once sync.Once
	return p.db, func() { once.Do(func() { m.release(p) }) }, nil
}

// reusable reports whether the existing pool can serve a request that carries id's token.
func (m *PoolManager) reusable(p *userPool, id *Identity, now time.Time) bool {
	if p.token == id.Token {
		return true
	}
	// A newer token means Grafana refreshed it: reconnect so StarRocks sees the current token.
	if id.Expiry.After(p.expiry) {
		return false
	}
	// An older or equally old token for the same user comes from another Grafana session of that user
	// (improvedExternalSessionHandling stores tokens per session). Keep the pool while its token is valid
	// instead of reconnecting on every alternate request.
	return p.expiry.Sub(now) >= minTokenValidity
}

func (m *PoolManager) openLocked(id *Identity, now time.Time) (*userPool, error) {
	cfg := m.base.Clone()
	cfg.User = id.Username
	cfg.Passwd = id.Token

	db, err := m.openDB(cfg)
	if err != nil {
		return nil, fmt.Errorf("create StarRocks connection pool: %w", err)
	}

	lifetime := id.Expiry.Sub(now)
	if m.cfg.ConnMaxLifetime > 0 && m.cfg.ConnMaxLifetime < lifetime {
		lifetime = m.cfg.ConnMaxLifetime
	}
	db.SetMaxOpenConns(m.cfg.MaxConnsPerUser)
	db.SetMaxIdleConns(m.cfg.MaxConnsPerUser)
	db.SetConnMaxIdleTime(m.cfg.ConnMaxIdleTime)
	db.SetConnMaxLifetime(lifetime)

	p := &userPool{db: db, token: id.Token, expiry: id.Expiry, lastUsed: now}
	m.pools[id.Username] = p
	m.log.Debug("Opened StarRocks connection pool", "starrocksUser", id.Username, "tokenExpiresIn", id.Expiry.Sub(now).Round(time.Second).String(), "pools", len(m.pools))
	return p, nil
}

func (m *PoolManager) release(p *userPool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p.leases--
	if p.retired && p.leases == 0 {
		go closeDB(m.log, p.db)
	}
}

// retireLocked removes the pool from the map and closes it once no request is using it.
func (m *PoolManager) retireLocked(username string, p *userPool, reason string) {
	if p.retired {
		return
	}
	p.retired = true
	if m.pools[username] == p {
		delete(m.pools, username)
	}
	m.log.Debug("Retiring StarRocks connection pool", "starrocksUser", username, "reason", reason, "inFlight", p.leases)
	if p.leases == 0 {
		go closeDB(m.log, p.db)
	}
}

func closeDB(logger log.Logger, db *sql.DB) {
	if err := db.Close(); err != nil {
		logger.Warn("Failed to close StarRocks connection pool", "error", err)
	}
}

func (m *PoolManager) sweepLoop() {
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-m.stop:
			return
		case <-ticker.C:
			m.sweep()
		}
	}
}

func (m *PoolManager) sweep() {
	now := m.now()
	m.mu.Lock()
	defer m.mu.Unlock()
	for username, p := range m.pools {
		switch {
		case p.expiry.Sub(now) < minTokenValidity:
			m.retireLocked(username, p, "token expired")
		case p.leases == 0 && now.Sub(p.lastUsed) > m.cfg.PoolIdleExpiry:
			m.retireLocked(username, p, "idle")
		}
	}
}

// Close retires every pool. Requests already holding a pool finish before it is closed.
func (m *PoolManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return
	}
	m.closed = true
	close(m.stop)
	for username, p := range m.pools {
		m.retireLocked(username, p, "datasource disposed")
	}
}

// Len returns the number of active user pools.
func (m *PoolManager) Len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pools)
}
