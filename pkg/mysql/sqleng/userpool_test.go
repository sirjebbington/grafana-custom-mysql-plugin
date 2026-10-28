package sqleng

import (
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/stretchr/testify/require"
)

// testPools returns a PoolManager with a controllable clock. sql.OpenDB does not connect until a query
// runs, so these tests need no server; they record the config each pool was opened with.
func testPools(t *testing.T, cfg PoolConfig) (*PoolManager, *time.Time, *[]*mysql.Config) {
	t.Helper()
	base := mysql.NewConfig()
	base.Addr = "starrocks.invalid:9030"
	base.AllowCleartextPasswords = true
	base.AllowOpenIDConnect = true
	m := newPoolManager(base, cfg, log.DefaultLogger)
	now := time.Date(2026, 10, 28, 10, 0, 0, 0, time.UTC)
	m.now = func() time.Time { return now }
	var opened []*mysql.Config
	m.openDB = func(c *mysql.Config) (*sql.DB, error) {
		opened = append(opened, c)
		return openDB(c)
	}
	t.Cleanup(m.Close)
	return m, &now, &opened
}

func TestPoolManager(t *testing.T) {
	t.Run("opens one pool per user with the token as password", func(t *testing.T) {
		m, now, opened := testPools(t, PoolConfig{})
		alice := &Identity{Username: "alice", Token: "tok-a", Expiry: now.Add(time.Hour)}
		bob := &Identity{Username: "bob", Token: "tok-b", Expiry: now.Add(time.Hour)}

		dbA, relA, err := m.Acquire(alice)
		require.NoError(t, err)
		dbB, relB, err := m.Acquire(bob)
		require.NoError(t, err)
		relA()
		relB()

		require.NotSame(t, dbA, dbB)
		require.Len(t, *opened, 2)
		require.Equal(t, "alice", (*opened)[0].User)
		require.Equal(t, "tok-a", (*opened)[0].Passwd)
		require.True(t, (*opened)[0].AllowOpenIDConnect)
		require.Equal(t, "bob", (*opened)[1].User)
		require.Equal(t, "tok-b", (*opened)[1].Passwd)
		require.Equal(t, 2, m.Len())
	})

	t.Run("reuses the pool for the same token", func(t *testing.T) {
		m, now, opened := testPools(t, PoolConfig{})
		id := &Identity{Username: "alice", Token: "tok-1", Expiry: now.Add(time.Hour)}
		db1, rel1, err := m.Acquire(id)
		require.NoError(t, err)
		db2, rel2, err := m.Acquire(id)
		require.NoError(t, err)
		rel1()
		rel2()
		require.Same(t, db1, db2)
		require.Len(t, *opened, 1)
	})

	t.Run("refreshed token replaces the pool and closes the old one after in-flight requests", func(t *testing.T) {
		m, now, opened := testPools(t, PoolConfig{})
		old := &Identity{Username: "alice", Token: "tok-1", Expiry: now.Add(10 * time.Minute)}
		refreshed := &Identity{Username: "alice", Token: "tok-2", Expiry: now.Add(time.Hour)}

		oldDB, relOld, err := m.Acquire(old)
		require.NoError(t, err)

		newDB, relNew, err := m.Acquire(refreshed)
		require.NoError(t, err)
		defer relNew()
		require.NotSame(t, oldDB, newDB)
		require.Len(t, *opened, 2)
		require.Equal(t, "tok-2", (*opened)[1].Passwd)

		// the old pool is still usable by the request that holds it
		require.NotErrorIs(t, oldDB.Ping(), sql.ErrConnDone)
		relOld()
		require.Eventually(t, func() bool { return oldDB.Ping() != nil && oldDB.Ping().Error() == "sql: database is closed" }, time.Second, 10*time.Millisecond)
		require.Equal(t, 1, m.Len())
	})

	t.Run("older token of another session reuses the newer pool", func(t *testing.T) {
		m, now, opened := testPools(t, PoolConfig{})
		newer := &Identity{Username: "alice", Token: "session-2", Expiry: now.Add(time.Hour)}
		older := &Identity{Username: "alice", Token: "session-1", Expiry: now.Add(30 * time.Minute)}

		db1, rel1, err := m.Acquire(newer)
		require.NoError(t, err)
		rel1()
		db2, rel2, err := m.Acquire(older)
		require.NoError(t, err)
		rel2()
		require.Same(t, db1, db2)
		require.Len(t, *opened, 1)
	})

	t.Run("rejects expired tokens", func(t *testing.T) {
		m, now, opened := testPools(t, PoolConfig{})
		_, _, err := m.Acquire(&Identity{Username: "alice", Token: "t", Expiry: now.Add(5 * time.Second)})
		require.ErrorIs(t, err, ErrTokenExpired)
		require.Empty(t, *opened)
	})

	t.Run("sweep retires pools whose token expired and pools left idle", func(t *testing.T) {
		m, now, _ := testPools(t, PoolConfig{PoolIdleExpiry: 10 * time.Minute})
		_, rel, err := m.Acquire(&Identity{Username: "short", Token: "t1", Expiry: now.Add(2 * time.Minute)})
		require.NoError(t, err)
		rel()
		_, rel, err = m.Acquire(&Identity{Username: "idle", Token: "t2", Expiry: now.Add(time.Hour)})
		require.NoError(t, err)
		rel()
		_, relBusy, err := m.Acquire(&Identity{Username: "busy", Token: "t3", Expiry: now.Add(time.Hour)})
		require.NoError(t, err)
		require.Equal(t, 3, m.Len())

		*now = now.Add(5 * time.Minute)
		m.sweep()
		require.Equal(t, 2, m.Len(), "expired token pool retired")

		*now = now.Add(11 * time.Minute)
		m.sweep()
		require.Equal(t, 1, m.Len(), "idle pool retired, pool with an in-flight request kept")
		relBusy()
	})

	t.Run("per-user connection cap is applied", func(t *testing.T) {
		m, now, _ := testPools(t, PoolConfig{ConnMaxLifetime: 4 * time.Hour})
		db, rel, err := m.Acquire(&Identity{Username: "alice", Token: "t", Expiry: now.Add(time.Hour)})
		require.NoError(t, err)
		rel()
		require.Equal(t, DefaultMaxConnsPerUser, db.Stats().MaxOpenConnections)
	})

	t.Run("closed manager rejects requests", func(t *testing.T) {
		m, now, _ := testPools(t, PoolConfig{})
		m.Close()
		_, _, err := m.Acquire(&Identity{Username: "alice", Token: "t", Expiry: now.Add(time.Hour)})
		require.ErrorIs(t, err, ErrPoolManagerClosed)
	})

	t.Run("release is idempotent", func(t *testing.T) {
		m, now, _ := testPools(t, PoolConfig{})
		_, rel, err := m.Acquire(&Identity{Username: "alice", Token: "t", Expiry: now.Add(time.Hour)})
		require.NoError(t, err)
		rel()
		rel()
		require.Equal(t, 0, m.pools["alice"].leases)
	})

	t.Run("concurrent users", func(t *testing.T) {
		m, now, _ := testPools(t, PoolConfig{})
		var wg sync.WaitGroup
		for i := 0; i < 50; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				user := []string{"a", "b", "c", "d", "e"}[i%5]
				_, rel, err := m.Acquire(&Identity{Username: user, Token: "tok-" + user, Expiry: now.Add(time.Hour)})
				require.NoError(t, err)
				rel()
			}(i)
		}
		wg.Wait()
		require.Equal(t, 5, m.Len())
	})
}
