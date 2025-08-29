#!/usr/bin/env bash
set -euo pipefail

echo "Generating self-signed certificates for localhost testing..."

# Create the certs directory if it doesn't exist
mkdir -p contrib/certs

if [ ! -f contrib/certs/localhost.key.pem ]; then
  # Generate self-signed certificate using OpenSSL
  openssl req -x509 -newkey rsa:4096 -keyout contrib/certs/localhost.key.pem -out contrib/certs/localhost.crt.pem -days 365 -nodes -subj "/C=US/ST=Test/L=Test/O=Test/OU=Test/CN=localhost" -addext "subjectAltName = DNS:localhost,DNS:app.localhost,DNS:traefik.localhost,DNS:opencontracts.opensource.legal,IP:127.0.0.1,IP:::1"

  chmod 0600 contrib/certs/*.pem
  echo "✅ Certificates generated successfully"
else
  echo "✅ Certificates already exist"
fi

ls -la contrib/certs/
