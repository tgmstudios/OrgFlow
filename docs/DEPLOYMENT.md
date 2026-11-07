# Deployment (OKE East)

Production is **https://orgflow.dev** on the TGM OKE East cluster (Oracle Cloud, us-east-1, ARM64 nodes). The old AWS EC2/RDS/nginx/systemd host is retired; its scripts are archived under `deploy/legacy-ec2/` and are not used.

## Architecture

- Namespace `orgflow` (isolated). Ingress class `nginx`, host `orgflow.dev` (+ `www` 301 to apex), cert-manager `letsencrypt-cloudflare`, DNS-only CNAME to `ingress-east.tgm.one` (Cloudflare; external-dns on East runs `--dry-run`, so DNS is manual).
- `orgflow` Deployment: 1 replica, `Recreate`, one pod with three containers from **one image** (`backend` :3003, `frontend` :3002 `/a/`, `landing` :3001) plus a `migrate` init container (`prisma migrate deploy`, waits for Postgres). Ingress paths: `/a`→web, `/api /auth /docs /swagger /health`→api, `/`→landing.
- `postgres` StatefulSet: `pgvector/pgvector:pg17`, 5Gi Longhorn PVC. `orgflow-data` PVC (1Gi) holds `/app/backend/data`.
- Minimal resources (requests / limits): backend 50m,128Mi / 500m,512Mi; frontend 20m,64Mi / 250m,192Mi; landing 10m,48Mi / 200m,128Mi; postgres 50m,192Mi / 500m,384Mi.
- Image: `ghcr.io/tgmstudios/orgflow`, `linux/arm64` only, tagged by commit SHA. **The release identity is the digest**; manifests pin `@sha256:…`. There is no `latest` tag and nothing is deployed by mutable tag.
- Manifests in `deploy/k8s/`: `00-namespace`, `05-ci-rbac`, `10-postgres`, `20-app`, `30-ingress`, `40-networkpolicy`.

## Security

- Default-deny ingress and egress NetworkPolicies (`40-networkpolicy.yaml`, enforced by kube-router). Allowed: ingress-nginx→app ports, node probes, app↔postgres 5432, DNS, and app egress TCP 443 to public IPs only (RFC1918/CGNAT/link-local and the Kubernetes API are excluded). Do not loosen these to make a deploy work.
- CI identity `orgflow-deployer` (`05-ci-rbac.yaml`): namespaced Role only, no ClusterRole. get/patch/watch on deployment `orgflow`, get/patch on service `orgflow` and PVC `orgflow-data`, **patch only** on Secret `orgflow-app`. It cannot read any Secret, pods, or anything outside the namespace.
- Secrets (never in Git or logs): `orgflow-db` (`DATABASE_URL`), `orgflow-app` (`TOKEN_ENCRYPTION_KEY` plus optional integration keys, loaded via `envFrom`). `TOKEN_ENCRYPTION_KEY` seals stored Google sessions; never replace or delete it. Deploys only patch keys they have values for.

## Secrets / integration keys

GitHub Actions secrets (write-only): `EAST_KUBE_SERVER`, `EAST_KUBE_CA_B64`, `EAST_KUBE_TOKEN` (deployer SA token), `PROD_GOOGLE_CLIENT_ID`, `PROD_GOOGLE_CLIENT_SECRET`, `PROD_ELEVENLABS_API_KEY`, `PROD_ELEVENLABS_AGENT_ID`, `PROD_STRIPE_SECRET_KEY`, `PROD_STRIPE_PRICE_ID`, `PROD_LUMINAL_API_KEY` (**not set yet; Ask/draft/Discover/handoff return 503 `AI_NOT_CONFIGURED` until it is**). `GOOGLE_REDIRECT_URI` is pinned in `20-app.yaml` to `https://orgflow.dev/auth/google/callback`, so `PROD_GOOGLE_REDIRECT_URI` is unused. `EC2_HOST`, `EC2_SSH_KEY`, `EC2_USER` are obsolete and should be deleted by a repo admin.

## Pipeline (`.github/workflows/deploy.yml`)

1. **verify** (PRs and `main`): frozen-lockfile installs for backend/frontend/landing, Prisma generate, `bun run typecheck`, `bun run test` (backend + frontend server), landing typecheck/tests, production builds, manifest YAML parse and `bash -n` of the deploy script.
2. **image** (`main`/dispatch): one arm64 build on a GitHub ARM runner, pushed as `ghcr.io/tgmstudios/orgflow:<git sha>`; the build step's digest is passed on. Nothing else builds it.
3. **deploy**: runs `deploy/deploy-east.sh` with the deployer token: records the current image, merges integration keys into `orgflow-app`, applies `20-app.yaml` with the digest substituted, stamps the pod template (`orgflow.dev/deployed-sha`) so a changed Secret is re-read, waits for `rollout status` (the init container migrates the schema first), then checks public `/health`, `/a/`, `/`.

**Network prerequisite and runner.** The East API (`138.2.213.132:6443`) accepts only a short IP allowlist (`oke-api-us-east-1` security list), which includes the on-prem cluster's egress IP. The `deploy` job therefore runs on `vars.DEPLOY_RUNNER` = `orgflow-runners`: an ARC runner scale set registered to `https://github.com/tgmstudios/OrgFlow` only (source: `deploy/runner/`, installed with `deploy/runner/install.sh`).
- Location: on-prem RKE2, namespace `arc-runners-onprem`, Helm release `orgflow-runners` (gha-runner-scale-set 0.14.2); listener in `arc-systems`. Other repos' scale sets (`foligo`, `oneparty`, `agent-data-aggregator`, `mymedusa`) are untouched.
- Idle behavior: `minRunners: 0`, `maxRunners: 1`: no runner pod exists until a deploy job is queued; one ephemeral pod (no DinD, not privileged, no service-account token, 100m/256Mi request) runs the job and is deleted. Only the listener pod idles.
- Trust: the job only runs for `main` pushes / manual dispatch (`github.ref == 'refs/heads/main'`; PRs never reach it). The deploy token is the namespace-scoped `orgflow-deployer` (no cluster-admin anywhere in GitHub).
- Registration credential: the scale set reuses the existing in-cluster Secret `tgmstudios-github-auth` (key `github_token`, referenced by name; never copied or printed). Its blast radius is that of the existing token, which is the same trade-off the `foligo` set already makes; replace it with a repo-scoped GitHub App or fine-grained PAT when available.
- The deployer role can `patch` but not `get` `orgflow-app`, so `deploy-east.sh` sends the merge patch through `kubectl proxy` (plain `kubectl patch` needs a GET).
- Integration keys: Google (ID/secret) and ElevenLabs (key/agent) were merged on the first green deploy. Billing is Stripe (`PROD_STRIPE_SECRET_KEY`, `PROD_STRIPE_PRICE_ID`) and AI needs `PROD_LUMINAL_API_KEY`; none of these three GitHub secrets exist yet, so they are skipped (billing inert, AI Ask/drafting disabled) until supplied. Old Monetization/EC2 GitHub secrets are retained pending approval to delete.
- Never open the API to `0.0.0.0/0`.

## Manual deploy of a CI-built image (operator)

```sh
export KUBECONFIG=<east kubeconfig> ; kubectl config use-context context-cchn4ehd4qa
gh run view <run> --repo tgmstudios/OrgFlow            # the image job summary shows the digest
docker buildx imagetools inspect ghcr.io/tgmstudios/orgflow@sha256:<digest>   # must list linux/arm64
DIGEST=sha256:<digest> DEPLOYED_SHA=<git sha> deploy/deploy-east.sh
```

Supply integration keys as environment variables only if you hold them; omitted ones are left as-is.

## Verify

```sh
kubectl -n orgflow get deploy orgflow -o jsonpath='{.spec.template.spec.containers[*].image}'   # digest matches the CI artifact
kubectl -n orgflow get pods                                                  # 3/3 Ready, init migrate completed
curl -fsS https://orgflow.dev/health                                         # {"status":"ok","storage":"postgresql"}
curl -s -o /dev/null -w '%{http_code}\n' https://orgflow.dev/a/ https://orgflow.dev/   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://orgflow.dev/api/voice/session-token   # 401 = ElevenLabs configured, 503 = not
```

Authenticated check: sign up/log in at `/a/`, create a draft; Ask needs `LUMINAL_API_KEY`.

## Migrate

Prisma migrations (`backend/prisma/migrations`) run automatically in the `migrate` init container on every rollout and are idempotent. Add migrations backward compatible with the previous image (rollback does not undo them). Take a Postgres dump before a destructive migration: `kubectl -n orgflow exec postgres-0 -- pg_dump -U <user> <db> > backup.sql` (operator only; the CI token cannot exec).

## Roll back

Fastest: re-run the workflow with **workflow_dispatch → digest** = the previous known-good digest (skips build, runs deploy only). Manually: `DIGEST=<previous> deploy/deploy-east.sh`, or `kubectl -n orgflow rollout undo deployment/orgflow`. The previous digest is printed at the start of every deploy and in `kubectl rollout history`.

## Operator-only objects

RBAC, NetworkPolicies, ingress, postgres and namespace are applied by an operator with cluster credentials (`kubectl apply -f deploy/k8s/`, never `05-ci-rbac.yaml` via CI). Rotate the CI token by deleting Secret `orgflow-deployer-token`, re-applying `05-ci-rbac.yaml`, and re-setting `EAST_KUBE_TOKEN`.

Local development and tests: see the [root README](../README.md).
