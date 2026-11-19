package sqleng

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/require"
)

// unsignedJWT builds a JWT-shaped token with the given claims. The signature is not checked by the plugin.
func unsignedJWT(t *testing.T, claims map[string]any) string {
	t.Helper()
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload, err := json.Marshal(claims)
	require.NoError(t, err)
	return header + "." + base64.RawURLEncoding.EncodeToString(payload) + ".c2lnbmF0dXJl"
}

func requestWithHeaders(headers map[string]string) *backend.QueryDataRequest {
	return &backend.QueryDataRequest{Headers: headers}
}

func TestIdentityFromRequest(t *testing.T) {
	exp := time.Now().Add(time.Hour).Truncate(time.Second)
	idToken := unsignedJWT(t, map[string]any{"sub": "kmbl312345", "user_name": "KMBL312345", "exp": exp.Unix()})
	accessToken := unsignedJWT(t, map[string]any{"sub": "kmbl399999", "exp": exp.Unix()})

	// Headers exactly as Grafana's OAuthTokenMiddleware sets them
	headers := map[string]string{
		backend.OAuthIdentityTokenHeaderName:   "Bearer " + accessToken,
		backend.OAuthIdentityIDTokenHeaderName: idToken,
	}

	t.Run("defaults to the ID token and the sub claim", func(t *testing.T) {
		id, err := IdentityFromRequest(requestWithHeaders(headers), IdentityConfig{})
		require.NoError(t, err)
		require.Equal(t, "kmbl312345", id.Username)
		require.Equal(t, idToken, id.Token)
		require.True(t, id.Expiry.Equal(exp))
	})

	t.Run("access token strips the token type", func(t *testing.T) {
		id, err := IdentityFromRequest(requestWithHeaders(headers), IdentityConfig{TokenSource: TokenSourceAccessToken})
		require.NoError(t, err)
		require.Equal(t, "kmbl399999", id.Username)
		require.Equal(t, accessToken, id.Token)
	})

	t.Run("username claim is configurable", func(t *testing.T) {
		id, err := IdentityFromRequest(requestWithHeaders(headers), IdentityConfig{UsernameClaim: "user_name"})
		require.NoError(t, err)
		require.Equal(t, "KMBL312345", id.Username)
	})

	t.Run("header lookup is case-insensitive", func(t *testing.T) {
		id, err := IdentityFromRequest(requestWithHeaders(map[string]string{"x-id-token": idToken}), IdentityConfig{})
		require.NoError(t, err)
		require.Equal(t, "kmbl312345", id.Username)
	})

	t.Run("works for health check requests", func(t *testing.T) {
		req := &backend.CheckHealthRequest{Headers: headers}
		id, err := IdentityFromRequest(req, IdentityConfig{})
		require.NoError(t, err)
		require.Equal(t, "kmbl312345", id.Username)
	})

	t.Run("no token", func(t *testing.T) {
		_, err := IdentityFromRequest(requestWithHeaders(map[string]string{}), IdentityConfig{})
		require.ErrorIs(t, err, ErrNoToken)
	})

	t.Run("ID token missing while access token present", func(t *testing.T) {
		req := requestWithHeaders(map[string]string{backend.OAuthIdentityTokenHeaderName: "Bearer " + accessToken})
		_, err := IdentityFromRequest(req, IdentityConfig{})
		require.ErrorIs(t, err, ErrNoToken)
	})

	t.Run("opaque access token", func(t *testing.T) {
		req := requestWithHeaders(map[string]string{backend.OAuthIdentityTokenHeaderName: "Bearer ory_at_abc123.def"})
		_, err := IdentityFromRequest(req, IdentityConfig{TokenSource: TokenSourceAccessToken})
		require.ErrorContains(t, err, "not a JWT")
	})

	t.Run("missing username claim", func(t *testing.T) {
		_, err := IdentityFromRequest(requestWithHeaders(headers), IdentityConfig{UsernameClaim: "email"})
		require.ErrorContains(t, err, `no string claim "email"`)
	})

	t.Run("missing exp claim", func(t *testing.T) {
		tok := unsignedJWT(t, map[string]any{"sub": "kmbl312345"})
		_, err := IdentityFromRequest(requestWithHeaders(map[string]string{backend.OAuthIdentityIDTokenHeaderName: tok}), IdentityConfig{})
		require.ErrorContains(t, err, "no exp claim")
	})

	t.Run("garbage payload", func(t *testing.T) {
		_, err := IdentityFromRequest(requestWithHeaders(map[string]string{backend.OAuthIdentityIDTokenHeaderName: "a.!!!.c"}), IdentityConfig{})
		require.ErrorContains(t, err, "decode JWT payload")
	})

	t.Run("unknown token source", func(t *testing.T) {
		_, err := IdentityFromRequest(requestWithHeaders(headers), IdentityConfig{TokenSource: "refresh_token"})
		require.ErrorContains(t, err, "unsupported tokenSource")
	})
}
