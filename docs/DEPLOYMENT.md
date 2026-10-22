# ShopSmart — Deployment guide

## Hosting requirements (verified against the implementation)

| Requirement | Why | Consequence |
| --- | --- | --- |
| Long-running Node process for MCP | `mcp-server/index.ts` holds Streamable HTTP transports in an in-memory map keyed by `Mcp-Session-Id` | **No pure serverless** (AWS Lambda, Vercel Functions) for the MCP server. Use a container/VM/persistent service. |
| Single MCP instance (or sticky sessions) | MCP session state is per-process memory; a second replica does not know another replica's sessions | Run **one** MCP replica, or put session-affinity (sticky) routing in front. Horizontal MCP scaling needs an external session store — not implemented. |
| PostgreSQL 14+ | Sessions, briefs, products, cart, pending consent actions, audit events are durable state (Prisma) | Any managed Postgres works (RDS, Neon, Supabase, Railway, Fly Postgres, Docker). Run `prisma migrate deploy` on deploy. |
| Web tier | Next.js App Router; server-side MCP client | Vercel/containers/Node hosting all work for the web tier **if** it can reach the MCP server over HTTP. |
| Network reachability | Web → MCP (`MCP_SERVER_URL`), MCP → Postgres, Web → Postgres | Keep MCP on a **private network**; do not expose port 3101 publicly. It has Origin allowlisting but no user auth. |

Verified locally (2026-10-20): Docker Compose topology (`db` + `mcp` + `web`) built from the repo `Dockerfile` (targets `mcp` and `web`) and brought up together — web returned 200, MCP `/health` responded on its published port, and the web container reached the MCP container (`/api/mcp/status` ok with all 13 tools). Two real blockers were found and fixed during verification: the production build failed on ESLint `prefer-const` errors, and the MCP server's loopback-only bind was unreachable from other containers (now `MCP_HOST`, set to `0.0.0.0` in Compose). A `.dockerignore` was also added (build context previously included ~757MB of `node_modules`).

## Recommended topology

```
Internet ──► Web (Next.js, :3000, public)
                │  MCP_SERVER_URL=http://mcp:3101/mcp (private network)
                ▼
             MCP server (:3101, private, single replica)
                │
                ▼
             PostgreSQL (private)
```

## Option A — Amazon EC2 + Docker Compose (recommended for judging / AWS Builder)

Single EC2 instance running the repo `docker-compose.yml` (`db` + `mcp` + `web`). This is the public-demo topology: judges reach only the web app; MCP (3101) and Postgres (5433) stay private on the Compose network.

1. Launch Ubuntu Server 24.04 LTS, `t3.small` (2 vCPU / 2 GB) or larger, 20 GB gp3.
2. Attach an EC2 IAM role allowing Bedrock invocation (scope `Resource` to your model ARN once known):

   ```json
   { "Effect": "Allow", "Action": ["bedrock:InvokeModel"], "Resource": "*" }
   ```

   Set instance metadata hop limit to **2** so containers can obtain instance-role credentials; otherwise put `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` only in the server-side `.env` (never commit). Enable Bedrock model access for your region/account first if required. On any Bedrock error the app falls back to deterministic orchestration — the demo never hard-fails on the LLM.
3. Security group: TCP 3000 from `0.0.0.0/0` (public demo URL), TCP 22 from your IP only. Do **not** open 3101 or 5433 publicly.
4. Install Docker (Docker Engine + Compose plugin), clone the repo, then:

   ```bash
   cp .env.example .env   # set LLM_PROVIDER=bedrock, AWS_REGION=us-east-1, BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
   docker compose up -d db
   docker compose run --rm web npx prisma migrate deploy
   docker compose up --build -d
   docker compose exec web npm run db:seed
   curl -I http://127.0.0.1:3000
   ```

5. Public URL: `http://<public-dns>:3000` — put it in the Devpost testing instructions and keep the instance running, free and unrestricted, through the judging period.

> Demo-grade limits: HTTP on a raw EC2 host (no TLS unless you add ALB+ACM or a Caddy/nginx reverse proxy), default local-dev DB password in Compose, no user auth (session id is a bearer capability). Do not collect real user data on it.

## Option B — Docker Compose (single host, simplest)

```bash
cp .env.example .env        # edit secrets/origins for your host
docker compose up --build   # db + mcp + web
```

- Compose sets `MCP_HOST=0.0.0.0` **inside** the MCP container so the web container can reach it. Do not set that on a bare-metal public host.
- Postgres is published on host port 5433 by default; remove the `ports:` mapping for `db` in production.
- Migrations/seed are **not** run automatically by the containers. Run once against the composed DB:

```bash
docker compose up -d db
npx prisma migrate deploy   # DATABASE_URL pointing at the composed DB
npm run db:seed             # demo catalog; skip if you configure a live provider
docker compose up -d mcp web
```

## Option C — Separate services (e.g. Fly.io / Render / Railway / VPS)

1. Provision PostgreSQL; set `DATABASE_URL` on both web and MCP services.
2. Deploy the MCP service from the `Dockerfile` target `mcp` (or `npm run start:mcp`), port 3101, **one replica**, private networking, `MCP_HOST=0.0.0.0`, `MCP_ALLOWED_ORIGINS` = your web origin(s).
3. Run `npx prisma migrate deploy` (and `npm run db:seed` for the demo catalog) as a release step.
4. Deploy the web service (`Dockerfile` target `web`, or `npm run build && npm run start`), port 3000, with `MCP_SERVER_URL=http://<mcp-private-host>:3101/mcp`.
5. Health checks: web `GET /` (200), MCP `GET /health` (`{"ok":true,...}`), app-level `GET /api/mcp/status`.

## Environment variables

See `.env.example` (placeholders only — never commit real secrets).

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string for web + MCP. |
| `MCP_SERVER_URL` | yes | Full MCP endpoint the web tier calls, e.g. `http://mcp:3101/mcp`. |
| `MCP_ALLOWED_ORIGINS` | yes | Comma-separated browser origins allowed to call MCP. |
| `MCP_PORT` / `MCP_HOST` | no | Defaults `3101` / `127.0.0.1`. Containers need `MCP_HOST=0.0.0.0`. |
| `PENDING_CONSENT_TTL_SECONDS` | no | Consent proposal expiry, default 300. |
| `PRODUCT_PROVIDER` | no | `demo` (default, curated snapshot). `live` + `SERPAPI_API_KEY` returns real-time Amazon.in listings via SerpApi; without a key it falls back to the snapshot with a warning. |
| `SERPAPI_API_KEY` | no | SerpApi key for live mode (free tier: 250 searches/month). Never commit a real key. |
| `LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL` | no | `LLM_PROVIDER=none` (default) uses deterministic orchestration — no key needed. `openai` enables optional LLM tool-calling; consent stays server-side. |
| `AWS_REGION`, `BEDROCK_MODEL_ID` | no | For `LLM_PROVIDER=bedrock` (Amazon Bedrock Converse API). Credentials use the AWS SDK credential chain / EC2 IAM role. |
| `NEXT_PUBLIC_APP_URL` | no | Public URL of the web tier. |

## Session handling notes

- **ShopSmart sessions** (shopping state) are durable: stored in Postgres, restored after refresh/restart. The browser keeps only the session id in `localStorage`.
- **MCP protocol sessions** are ephemeral per-process: if the MCP process restarts, clients simply initialize a new session (the web client does this per operation/session automatically). No shopping data is lost because it lives in Postgres.
- The ShopSmart session id currently acts as a bearer capability (no per-user auth yet) — see `docs/KNOWN_LIMITATIONS.md`. Do not expose a multi-user production deployment without adding authentication.

## Security checklist before going public

- [ ] Real secrets only in the host's secret store; `.env` never committed (it is gitignored).
- [ ] MCP port not publicly reachable; web is the only public entry point.
- [ ] `MCP_ALLOWED_ORIGINS` set to your real web origin(s) only.
- [ ] Postgres not publicly reachable; strong DB password (Compose defaults are for local dev only).
- [ ] Add user authentication before multi-user use (not implemented).
- [ ] Rotate any API key that has ever been shared outside your secret store.

## Manual steps still required

- Provisioning the host/DB and setting real env values.
- Running migrations + seed on first deploy (commands above) — containers do not auto-migrate.
- Re-validate once on your actual target host (the verification above ran on the development machine); expect Docker builds to take several minutes on small hosts.
