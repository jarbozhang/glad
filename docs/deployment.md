# Deployment

This document describes how to deploy the Happy backend (`packages/happy-server`) and the infrastructure it expects.

## Runtime overview
- **App server:** Node.js running `tsx ./sources/main.ts` (Fastify + Socket.IO).
- **Database:** Postgres via Prisma.
- **Cache:** Redis (currently used for connectivity and future expansion).
- **Object storage:** S3-compatible storage for user-uploaded assets (MinIO works).
- **Metrics:** Optional Prometheus `/metrics` server on a separate port.

## Required services
1. **Postgres**
   - Required for all persisted data.
   - Configure via `DATABASE_URL`.

2. **Redis**
   - Required by startup (`redis.ping()` is called).
   - Configure via `REDIS_URL`.
   - Managed by this repo: `packages/happy-server/deploy/happy-redis.yaml` (StatefulSet + redis-exporter sidecar).

3. **S3-compatible storage**
   - Used for avatars and other uploaded assets.
   - Configure via `S3_HOST`, `S3_PORT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`, `S3_USE_SSL`.
   - Some providers, including Aliyun OSS, require virtual-hosted-style URLs; set `S3_PATH_STYLE=false` for those providers.
   - **Deployed separately** — not managed by this repo's Kubernetes manifests. In prod, the S3-compatible service (MinIO or similar) behind `S3_PUBLIC_URL` is provisioned and managed by external infrastructure. The app only consumes it via env vars: `S3_PUBLIC_URL` is set in the Deployment, and credentials come from Vault via ExternalSecret (`/handy-files`).
   - If `S3_HOST` is unset, the server falls back to local filesystem storage (`./data/files/`).
   - For local k8s dev, a MinIO pod is deployed via `deploy/overlays/local/minio.yaml`.

## Environment variables
**Required**
- `DATABASE_URL`: Postgres connection string.
- `HANDY_MASTER_SECRET`: master key for auth tokens and server-side encryption.
- `REDIS_URL`: Redis connection string.
- `S3_HOST`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`: object storage config.

**Common**
- `PORT`: API server port (default `3005`).
- `METRICS_ENABLED`: set to `false` to disable metrics server.
- `METRICS_PORT`: metrics server port (default `9090`).
- `S3_PORT`: optional S3 port.
- `S3_USE_SSL`: `true`/`false` (default `true`).
- `S3_PATH_STYLE`: `true`/`false` (default `true`). Set to `false` for providers that require bucket names in the hostname, such as Aliyun OSS.

Aliyun OSS Hong Kong example:
```env
S3_HOST=oss-cn-hongkong.aliyuncs.com
S3_USE_SSL=true
S3_PATH_STYLE=false
S3_REGION=oss-cn-hongkong
S3_ACCESS_KEY=<access-key-id>
S3_SECRET_KEY=<access-key-secret>
S3_BUCKET=bfelab-happy
S3_PUBLIC_URL=https://bfelab-happy.oss-cn-hongkong.aliyuncs.com
```

**Optional integrations**
- GitHub OAuth/App: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, plus redirect URL/URI.
  - `GITHUB_REDIRECT_URL` is used by the OAuth callback handler.
  - `GITHUB_REDIRECT_URI` is used by the GitHub App initializer.
- Voice: `ELEVENLABS_API_KEY` (required for `/v1/voice/conversations` in production).
- Subscriptions: `REVENUECAT_API_KEY` (server-side RevenueCat key, required for voice subscription checks).
- Debug logging: `DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING` (enables file logging + dev log endpoint).

## Docker image
A production Dockerfile is provided at `Dockerfile.server`.

Key notes:
- The server defaults to port `3005` (set `PORT` explicitly in container environments).
- The image includes FFmpeg and Python for media processing.

## Deploying `happy.bfelab.com`
`happy.bfelab.com` should run the current `happy-server` backend from this monorepo. It is not deployed with the legacy `happy-coder` relay-node installer: the relay-node flow installs a CLI/agent relay, while `happy.bfelab.com` is the shared HTTP + Socket.IO API that desktop, mobile, web, and CLI clients connect to.

Recommended shape:
- Run `packages/happy-server` as a long-lived service on the host.
- Put Nginx or another reverse proxy in front of it for TLS and WebSocket upgrades.
- Use Postgres for durable metadata, Redis when running more than one server process, and Aliyun OSS for uploaded assets.
- Point clients at `https://happy.bfelab.com` (`HAPPY_SERVER_URL` for CLI and `EXPO_PUBLIC_HAPPY_SERVER_URL` for app builds when overriding defaults).

### Server environment
Create a root-owned env file on the server, for example `/opt/happy/happy-server.env`. Keep this file out of git.

```env
NODE_ENV=production
PORT=3005
PUBLIC_URL=https://happy.bfelab.com
HANDY_MASTER_SECRET=<long-random-secret>

DATABASE_URL=postgresql://happy:<password>@127.0.0.1:5432/happy
REDIS_URL=redis://127.0.0.1:6379

S3_HOST=oss-cn-hongkong.aliyuncs.com
S3_USE_SSL=true
S3_PATH_STYLE=false
S3_REGION=oss-cn-hongkong
S3_ACCESS_KEY=<access-key-id>
S3_SECRET_KEY=<access-key-secret>
S3_BUCKET=bfelab-happy
S3_PUBLIC_URL=https://bfelab-happy.oss-cn-hongkong.aliyuncs.com
```

If you choose the standalone/PGlite mode instead of external Postgres, set `DB_PROVIDER=pglite`, `DATA_DIR=/opt/happy/data`, and run the standalone migration command before starting the server. For `happy.bfelab.com`, external Postgres is preferred because it is easier to back up, monitor, and scale.

### Docker deployment
Build and run the production image from the monorepo root:

```bash
docker build -t happy-server:latest -f Dockerfile.server .
docker run -d --name happy-server --restart unless-stopped \
  --env-file /opt/happy/happy-server.env \
  -p 127.0.0.1:3005:3005 \
  happy-server:latest
```

Run database migrations before replacing an existing production container:

```bash
docker run --rm --env-file /opt/happy/happy-server.env happy-server:latest \
  pnpm --filter happy-server exec prisma migrate deploy
```

### systemd deployment
If deploying directly on the host instead of Docker:

```bash
cd /opt/happy/glad
corepack enable
corepack prepare pnpm@10.11.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @slopus/happy-wire build
pnpm --filter happy-server build
set -a && . /opt/happy/happy-server.env && set +a
pnpm --filter happy-server exec prisma migrate deploy
```

Example unit:

```ini
[Unit]
Description=Happy server
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/happy/glad
EnvironmentFile=/opt/happy/happy-server.env
ExecStart=/usr/bin/pnpm --filter happy-server start
Restart=always
RestartSec=5
User=happy
Group=happy

[Install]
WantedBy=multi-user.target
```

### Reverse proxy
Nginx should terminate TLS and preserve WebSocket upgrades for Socket.IO:

```nginx
server {
    listen 443 ssl http2;
    server_name happy.bfelab.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

After deploy, verify:

```bash
curl -fsS https://happy.bfelab.com/health
curl -fsS http://127.0.0.1:9090/health
HAPPY_SERVER_URL=https://happy.bfelab.com happy doctor
```

## Kubernetes manifests
Example manifests live in `packages/happy-server/deploy`:
- `handy.yaml`: Deployment + Service + ExternalSecrets for the server.
- `happy-redis.yaml`: Redis StatefulSet + Service + ConfigMap.

The deployment config expects:
- Prometheus scraping annotations on port `9090`.
- A secret named `handy-secrets` populated by ExternalSecrets.
- A service mapping port `3000` to container port `3005`.

## Local dev helpers
The server package includes scripts for local infrastructure:
- `pnpm --filter happy-server db` (Postgres in Docker)
- `pnpm --filter happy-server redis`
- `pnpm --filter happy-server s3` + `s3:init`

Use `.env`/`.env.dev` to load local settings when running `pnpm --filter happy-server dev`.

## Implementation references
- Entrypoint: `packages/happy-server/sources/main.ts`
- Dockerfile: `Dockerfile.server`
- Kubernetes manifests: `packages/happy-server/deploy`
- Env usage: `packages/happy-server/sources` (`rg -n "process.env"`)
