#!/usr/bin/env bash
set -euo pipefail

# Reads shared PostgreSQL settings from a config file and appends them as
# -c flags to the postgres command, then delegates to the real entrypoint.
# This ensures shared values are defined in one place (shared.conf) rather
# than duplicated across local.yml, production.yml, and test.yml.

SHARED_CONF="/etc/postgresql-custom/shared.conf"
EXTRA_ARGS=()

if [ -f "$SHARED_CONF" ]; then
    while IFS='=' read -r key value; do
        # Trim leading/trailing whitespace
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"

        # Skip blank lines and comments
        [[ -z "$key" || "$key" == \#* ]] && continue

        EXTRA_ARGS+=("-c" "$key=$value")
    done < "$SHARED_CONF"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@" "${EXTRA_ARGS[@]}"
