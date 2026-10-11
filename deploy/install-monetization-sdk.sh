#!/usr/bin/env bash
# Install the private-beta AWS Monetization SDK into backend/node_modules.
# `bun install` cannot resolve it from the public registry, and the tarball is self-contained,
# so fetch it with the registry token and extract it in place. Never fails the deploy: without
# the package or a token the backend runs with billing disabled.
set -uo pipefail
APP_DIR="${APP_DIR:-/opt/app/backend}"
REGISTRY="${MONETIZATION_REGISTRY:-https://d10ia5fq6mr3er.cloudfront.net/registry}"
BUN="${BUN:-$HOME/.bun/bin/bun}"
cd "$APP_DIR"
token=$(sed -n 's/^MONETIZATION_REGISTRY_TOKEN=//p' .env 2>/dev/null | tail -1)
if [ -z "$token" ]; then
  echo "install-monetization-sdk: no MONETIZATION_REGISTRY_TOKEN; billing stays disabled"
  exit 0
fi
auth=(-H "Authorization: Bearer $token")
meta=$(curl -sf "${auth[@]}" "$REGISTRY/@aws-app-monetization%2fsdk") || {
  echo "install-monetization-sdk: registry unreachable or token rejected; billing stays disabled"
  exit 0
}
version=$(printf '%s' "$meta" | "$BUN" -e 'console.log(JSON.parse(await Bun.stdin.text())["dist-tags"].latest)') || exit 0
dest=node_modules/@aws-app-monetization/sdk
if [ -f "$dest/package.json" ] && grep -q "\"version\": \"$version\"" "$dest/package.json"; then
  echo "install-monetization-sdk: $version already installed"
  exit 0
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
curl -sf "${auth[@]}" -o "$tmp" "$REGISTRY/@aws-app-monetization/sdk/-/sdk-$version.tgz" || {
  echo "install-monetization-sdk: download failed; billing stays disabled"
  exit 0
}
rm -rf "$dest"
mkdir -p "$dest"
tar -xzf "$tmp" -C "$dest" --strip-components=1
echo "install-monetization-sdk: installed $version"
