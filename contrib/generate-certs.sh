#!/usr/bin/env bash
set -euo pipefail

echo "Generating self-signed certificates for localhost testing..."

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

if [ ! -f contrib/certs/localhost.key.pem ]; then
  # Generate self-signed certificate using OpenSSL
  echo "Generating certificates..."
  openssl req -x509 -newkey rsa:4096 -keyout contrib/certs/localhost.key.pem -out contrib/certs/localhost.crt.pem -days 365 -nodes -subj "/C=US/ST=Test/L=Test/O=Test/OU=Test/CN=localhost" -addext "subjectAltName = DNS:localhost,DNS:app.localhost,DNS:traefik.localhost,DNS:opencontracts.opensource.legal,IP:127.0.0.1,IP:::1"

  chmod 644 contrib/certs/*.pem  # Use 644 instead of 600 for GitHub Actions
  echo "✅ Certificates generated successfully"
else
  echo "✅ Certificates already exist"
fi

ls -la contrib/certs/
