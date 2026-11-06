#!/usr/bin/env bash
# Roll the OrgFlow image (by digest) out to OKE East, namespace `orgflow`. Used by CI (deploy.yml) and by an operator
# for a manual deploy, so both paths are identical.
#   KUBECONFIG=<namespace-scoped or operator kubeconfig> DIGEST=sha256:<64 hex> [DEPLOYED_SHA=<git sha>] deploy/deploy-east.sh
# Optional integration keys in the environment (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ELEVENLABS_API_KEY,
# ELEVENLABS_AGENT_ID, STRIPE_SECRET_KEY, STRIPE_PRICE_ID, LUMINAL_API_KEY) are merged into Secret
# orgflow-app (patch only; TOKEN_ENCRYPTION_KEY and other keys are never touched). Empty values are skipped.
set -euo pipefail
NS=orgflow
cd "$(dirname "$0")/.."
[[ "${DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "DIGEST must be sha256:<64 hex>" >&2; exit 2; }

echo "Rollback reference (current image):"
kubectl -n "$NS" get deployment orgflow -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'

keys=(GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ELEVENLABS_API_KEY ELEVENLABS_AGENT_ID STRIPE_SECRET_KEY STRIPE_PRICE_ID LUMINAL_API_KEY)
json='{"stringData":{}}'; sent=()
for k in "${keys[@]}"; do
  if [ -n "${!k:-}" ]; then json=$(jq -c --arg k "$k" --arg v "${!k}" '.stringData[$k]=$v' <<<"$json"); sent+=("$k"); else echo "not provided, skipped: $k"; fi
done
if [ "${#sent[@]}" -gt 0 ]; then
  printf '%s' "$json" | kubectl -n "$NS" patch secret orgflow-app --type merge --patch-file /dev/stdin >/dev/null
fi
echo "integration keys patched: ${sent[*]:-none}"

tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
sed -E "s#ghcr.io/tgmstudios/orgflow@sha256:[0-9a-f]{64}#ghcr.io/tgmstudios/orgflow@${DIGEST}#g" deploy/k8s/20-app.yaml > "$tmp"
kubectl -n "$NS" apply -f "$tmp"
# Env from the Secret is read at container start; the annotation forces a new pod even when the image is unchanged.
kubectl -n "$NS" patch deployment orgflow --type merge \
  -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"orgflow.dev/deployed-sha\":\"${DEPLOYED_SHA:-manual}\"}}}}}"
kubectl -n "$NS" rollout status deployment/orgflow --timeout=420s
echo "Running images:"
kubectl -n "$NS" get deployment orgflow -o jsonpath='{range .spec.template.spec.initContainers[*]}{.name}={.image}{"\n"}{end}{range .spec.template.spec.containers[*]}{.name}={.image}{"\n"}{end}'
