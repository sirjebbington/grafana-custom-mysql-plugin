// Command devjwt creates a local RSA signing key, publishes it as a JWKS file, and signs test JWTs that look
// like IDAM ID tokens. It exists to test the plugin against a local StarRocks without IDAM.
//
//	go run ./tools/devjwt keygen -dir ./dev/jwt             # writes key.pem and jwks.json
//	go run ./tools/devjwt sign -dir ./dev/jwt -sub kmbl3test1 -iss https://local-idam/ -aud grafana-local -ttl 1h
package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"time"
)

const keyID = "devjwt-1"

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: devjwt keygen|sign [flags]")
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "keygen":
		err = keygen(os.Args[2:])
	case "sign":
		err = sign(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "devjwt:", err)
		os.Exit(1)
	}
}

func keygen(args []string) error {
	fs := flag.NewFlagSet("keygen", flag.ExitOnError)
	dir := fs.String("dir", "dev/jwt", "output directory")
	_ = fs.Parse(args)

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(*dir, 0o755); err != nil {
		return err
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	if err := os.WriteFile(filepath.Join(*dir, "key.pem"), keyPEM, 0o600); err != nil {
		return err
	}

	jwks := map[string]any{"keys": []map[string]string{{
		"kty": "RSA",
		"use": "sig",
		"alg": "RS256",
		"kid": keyID,
		"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
	}}}
	out, err := json.MarshalIndent(jwks, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(*dir, "jwks.json"), out, 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %s and %s\n", filepath.Join(*dir, "key.pem"), filepath.Join(*dir, "jwks.json"))
	return nil
}

func sign(args []string) error {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	dir := fs.String("dir", "dev/jwt", "directory containing key.pem")
	sub := fs.String("sub", "kmbl3test1", "sub claim (lowercase IDAM user id)")
	userName := fs.String("user-name", "", "user_name claim (defaults to upper-case sub)")
	iss := fs.String("iss", "https://local-idam/", "iss claim")
	aud := fs.String("aud", "grafana-local", "aud claim")
	ttl := fs.Duration("ttl", time.Hour, "token lifetime")
	_ = fs.Parse(args)

	keyPEM, err := os.ReadFile(filepath.Join(*dir, "key.pem"))
	if err != nil {
		return err
	}
	block, _ := pem.Decode(keyPEM)
	if block == nil {
		return errors.New("key.pem is not PEM")
	}
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return err
	}

	if *userName == "" {
		*userName = upper(*sub)
	}
	now := time.Now()
	claims := map[string]any{
		"iss":       *iss,
		"sub":       *sub,
		"aud":       []string{*aud},
		"exp":       now.Add(*ttl).Unix(),
		"iat":       now.Unix(),
		"auth_time": now.Unix(),
		"user_name": *userName,
	}
	header := map[string]string{"alg": "RS256", "typ": "JWT", "kid": keyID}

	h, _ := json.Marshal(header)
	c, _ := json.Marshal(claims)
	signingInput := base64.RawURLEncoding.EncodeToString(h) + "." + base64.RawURLEncoding.EncodeToString(c)
	digest := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		return err
	}
	fmt.Println(signingInput + "." + base64.RawURLEncoding.EncodeToString(sig))
	return nil
}

func upper(s string) string {
	b := []byte(s)
	for i, ch := range b {
		if ch >= 'a' && ch <= 'z' {
			b[i] = ch - 32
		}
	}
	return string(b)
}
