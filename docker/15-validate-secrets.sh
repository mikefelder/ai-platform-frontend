#!/bin/sh
set -eu

case "${APIM_SUBSCRIPTION_KEY:-}" in
    ''|*[!A-Za-z0-9_-]*)
        echo >&2 "APIM_SUBSCRIPTION_KEY must be a non-empty alphanumeric, underscore or hyphen value."
        exit 1
        ;;
esac

if [ -n "${FRONTEND_HTPASSWD:-}" ]; then
    mkdir -p /run/secrets/frontend
    umask 027
    printf '%s\n' "$FRONTEND_HTPASSWD" > /run/secrets/frontend/htpasswd
    chown root:nginx /run/secrets/frontend/htpasswd
    chmod 640 /run/secrets/frontend/htpasswd
fi

if [ ! -r /run/secrets/frontend/htpasswd ] || [ ! -s /run/secrets/frontend/htpasswd ]; then
    echo >&2 "A readable, non-empty password file is required at /run/secrets/frontend/htpasswd."
    exit 1
fi
