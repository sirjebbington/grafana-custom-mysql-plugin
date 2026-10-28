package sqleng

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

const (
	TokenSourceIDToken     = "id_token"
	TokenSourceAccessToken = "access_token"

	DefaultUsernameClaim = "sub"
)

// ErrNoToken is returned when Grafana did not attach an IDAM token to the request. This happens for
// alert evaluation, service accounts, users who signed in without IDAM (basic auth admin), and when the
// datasource does not have oauthPassThru enabled.
var ErrNoToken = errors.New("no IDAM token on this request: sign in to Grafana through IDAM (alerting, service accounts and basic-auth users are not supported by this datasource)")

// Identity is the StarRocks login derived from the signed-in user's IDAM token.
// The plugin does not verify the token signature: StarRocks does that when the connection authenticates.
// The claims are read only to choose the MySQL username and to bound connection lifetime by the token expiry.
type Identity struct {
	Username string
	Token    string
	Expiry   time.Time
}

// IdentityConfig selects which forwarded token is sent to StarRocks and which claim becomes the username.
type IdentityConfig struct {
	TokenSource   string
	UsernameClaim string
}

func (c IdentityConfig) withDefaults() IdentityConfig {
	if c.TokenSource == "" {
		c.TokenSource = TokenSourceIDToken
	}
	if c.UsernameClaim == "" {
		c.UsernameClaim = DefaultUsernameClaim
	}
	return c
}

// HeaderGetter is implemented by backend.QueryDataRequest and backend.CheckHealthRequest.
type HeaderGetter interface {
	GetHTTPHeader(key string) string
}

// IdentityFromRequest reads the IDAM token that Grafana's OAuth pass-through middleware attached to the
// request (Authorization: Bearer <access token>, X-Id-Token: <id token>) and extracts the username claim.
func IdentityFromRequest(req HeaderGetter, cfg IdentityConfig) (*Identity, error) {
	cfg = cfg.withDefaults()

	var raw string
	switch cfg.TokenSource {
	case TokenSourceAccessToken:
		raw = req.GetHTTPHeader(backend.OAuthIdentityTokenHeaderName)
		// Grafana sends "<token type> <token>", normally "Bearer <token>"
		if _, token, found := strings.Cut(raw, " "); found {
			raw = token
		}
	case TokenSourceIDToken:
		raw = req.GetHTTPHeader(backend.OAuthIdentityIDTokenHeaderName)
	default:
		return nil, fmt.Errorf("unsupported tokenSource %q: use %q or %q", cfg.TokenSource, TokenSourceIDToken, TokenSourceAccessToken)
	}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, ErrNoToken
	}

	claims, err := decodeClaims(raw)
	if err != nil {
		return nil, fmt.Errorf("the IDAM %s cannot be used: %w", cfg.TokenSource, err)
	}

	username, _ := claims[cfg.UsernameClaim].(string)
	if username == "" {
		return nil, fmt.Errorf("the IDAM %s has no string claim %q to use as the StarRocks username", cfg.TokenSource, cfg.UsernameClaim)
	}

	exp, ok := claims["exp"].(float64)
	if !ok {
		return nil, fmt.Errorf("the IDAM %s has no exp claim", cfg.TokenSource)
	}

	return &Identity{Username: username, Token: raw, Expiry: time.Unix(int64(exp), 0)}, nil
}

// decodeClaims returns the unverified payload of a JWS compact token.
func decodeClaims(raw string) (map[string]any, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		// Ory Hydra access tokens are opaque (ory_at_...) unless the client uses the jwt access token strategy
		return nil, errors.New("it is not a JWT (opaque token?)")
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return nil, fmt.Errorf("decode JWT payload: %w", err)
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("parse JWT claims: %w", err)
	}
	return claims, nil
}
