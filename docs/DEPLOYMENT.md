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

GitHub Actions secrets (write-only): `EAST_KUBE_SERVER`, `EAST_KUBE_CA_B64`, `EAST_KUBE_TOKEN` (deployer SA token), `PROD_GOOGLE_CLIENT_ID`, `PROD_GOOGLE_CLIENT_SECRET`, `PROD_ELEVENLABS_API_KEY`, `PROD_ELEVENLABS_AGENT_ID`, `PROD_MONETIZATION_APP_ID`, `MONETIZATION_REGISTRY_TOKEN`, `PROD_LUMINAL_API_KEY` (**not set yet; Ask/draft/Discover/handoff return 503 `AI_NOT_CONFIGURED` until it is**). `GOOGLE_REDIRECT_URI` is pinned in `20-app.yaml` to `https://orgflow.dev/auth/google/callback`, so `PROD_GOOGLE_REDIRECT_URI` is unused. `EC2_HOST`, `EC2_SSH_KEY`, `EC2_USER` are obsolete and should be deleted by a repo admin.

## Pipeline (`.github/workflows/deploy.yml`)

1. **verify** (PRs and `main`): frozen-lockfile installs for backend/frontend/landing, Prisma generate, `bun run typecheck`, `bun run test` (backend + frontend server), landing typecheck/tests, production builds, manifest YAML parse and `bash -n` of the deploy script.
2. **image** (`main`/dispatch): one arm64 build on a GitHub ARM runner, pushed as `ghcr.io/tgmstudios/orgflow:<git sha>`; the build step's digest is passed on. Nothing else builds it.
3. **deploy**: runs `deploy/deploy-east.sh` with the deployer token: records the current image, merges integration keys into `orgflow-app`, applies `20-app.yaml` with the digest substituted, stamps the pod template (`orgflow.dev/deployed-sha`) so a changed Secret is re-read, waits for `rollout status` (the init container migrates the schema first), then checks public `/health`, `/a/`, `/`.

**Network prerequisite.** The East API (`138.2.213.132:6443`) accepts only a short IP allowlist (`oke-api-us-east-1` security list). GitHub-hosted runners cannot reach it, so the deploy job's preflight fails fast with that explanation. The `deploy` job runs on `vars.DEPLOY_RUNNER` (default `ubuntu-24.04`). To automate, an admin must approve one of: a scoped on-demand runner for this repo only on an allowlisted host (TGM pattern: ARC runner sets per repo, e.g. `foligo`→`tgmstudios-runners`; set `DEPLOY_RUNNER` to its label), or allowlisting additional source addresses. Never open the API to `0.0.0.0/0` and never reuse another repo's runner set.

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
