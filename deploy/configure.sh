#!/usr/bin/env bash
set -euo pipefail
# Run from the deployed checkout on the existing EC2 server.
install -d /etc/systemd/system/frontend.service.d /etc/systemd/system/backend.service.d
cat > /etc/systemd/system/frontend.service.d/production.conf <<'CONFIG'
[Service]
Environment=NODE_ENV=production
Environment=FRONTEND_BASE_PATH=/a
Environment=BACKEND_URL=http://127.0.0.1:3003
CONFIG
cat > /etc/systemd/system/backend.service.d/production.conf <<'CONFIG'
[Service]
Environment=NODE_ENV=production
Environment=FRONTEND_ORIGIN=https://orgflow.dev
Environment=FRONTEND_REDIRECT_URL=https://orgflow.dev/a/
CONFIG
# .env and data are deliberately managed separately from source deployment.
cp -n /etc/nginx/nginx.conf /etc/nginx/nginx.conf.pre-orgflow-a || true
cp /opt/app/deploy/nginx.conf /etc/nginx/nginx.conf
if ! nginx -t; then
    cp /etc/nginx/nginx.conf.pre-orgflow-a /etc/nginx/nginx.conf
    exit 1
fi
systemctl daemon-reload
