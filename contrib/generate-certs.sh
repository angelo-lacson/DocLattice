#!/usr/bin/env bash
set -euo pipefail

echo "Generating self-signed certificates for localhost testing..."

echo "OpenSSL version: $(openssl version || echo 'unknown')"

# Debug: Check current directory and permissions
echo "Current directory: $(pwd)"
echo "User: $(whoami)"
echo "contrib directory permissions:"
ls -la contrib/ || echo "contrib does not exist"

# Remove and recreate the certs directory to ensure clean state
rm -rf contrib/certs
mkdir -p contrib/certs
chmod 755 contrib/certs

echo "contrib/certs directory created with permissions:"
ls -la contrib/certs/

# Generate self-signed certificate using OpenSSL
echo "Generating certificates..."
openssl req -x509 -newkey rsa:4096 \
  -keyout contrib/certs/localhost.key.pem \
  -out contrib/certs/localhost.crt.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=Test/L=Test/O=Test/OU=Test/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:app.localhost,DNS:traefik.localhost,DNS:opencontracts.opensource.legal,IP:127.0.0.1,IP::1"

# Correct IPv6 loopback in SAN for compatibility if older OpenSSL rejects IP:::1
if ! openssl x509 -in contrib/certs/localhost.crt.pem -noout >/dev/null 2>&1; then
  echo "Regenerating certificate with corrected IPv6 loopback..."
  openssl req -x509 -newkey rsa:4096 \
    -keyout contrib/certs/localhost.key.pem \
    -out contrib/certs/localhost.crt.pem \
    -days 365 \
    -nodes \
    -subj "/C=US/ST=Test/L=Test/O=Test/OU=Test/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:app.localhost,DNS:traefik.localhost,DNS:opencontracts.opensource.legal,IP:127.0.0.1,IP:::1"
fi

chmod 644 contrib/certs/*.pem  # Use 644 instead of 600 for GitHub Actions

# Basic validation
echo "Validating generated certificate and key..."
head -2 contrib/certs/localhost.crt.pem || true
head -2 contrib/certs/localhost.key.pem || true

if ! grep -q "BEGIN CERTIFICATE" contrib/certs/localhost.crt.pem; then
  echo "ERROR: Certificate file is not in PEM format or is empty" >&2
  exit 1
fi
if ! grep -q "BEGIN .*PRIVATE KEY" contrib/certs/localhost.key.pem; then
  echo "ERROR: Key file is not in PEM format or is empty" >&2
  exit 1
fi

echo "✅ Certificates generated and validated successfully"
ls -la contrib/certs/
