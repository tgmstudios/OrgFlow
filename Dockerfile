# OrgFlow single image: backend (3003), frontend (3002) and landing (3001) are selected by the container command.
# Built by CI (.github/workflows/deploy.yml) for linux/arm64 (OKE east nodes) and deployed by digest; see docs/DEPLOYMENT.md.
# Local: docker buildx build --platform linux/arm64 -t orgflow:local .
FROM oven/bun:1
LABEL org.opencontainers.image.source="https://github.com/tgmstudios/OrgFlow"
WORKDIR /app
COPY backend/package.json backend/bun.lock backend/
COPY frontend/package.json frontend/bun.lock frontend/
COPY landing/package.json landing/bun.lock landing/
RUN bun install --cwd backend --frozen-lockfile && bun install --cwd frontend --frozen-lockfile && bun install --cwd landing --frozen-lockfile
COPY backend backend
COPY frontend frontend
COPY landing landing
COPY demo-content demo-content
COPY .env.monetization .env.monetization
COPY deploy/landing-serve.ts landing/serve.ts
RUN cd backend && DATABASE_URL=postgresql://build:build@localhost:5432/build bunx --bun prisma generate \
 && cd ../frontend && bun run build \
 && cd ../landing && bun run build.ts
ENV NODE_ENV=production HOST=0.0.0.0
USER bun
WORKDIR /app/backend
CMD ["bun", "run", "index.ts"]
