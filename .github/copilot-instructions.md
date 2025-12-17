
# Copilot instructions (GitHubMetrics)

## What this repo is
- Small TypeScript SDK + CLI to fetch GitHub Copilot **organization** metrics using **GitHub App server-to-server auth** (no user PAT/OAuth).
- Data flow: App private key (.pem) → JWT → installation access token → `GET /orgs/{org}/copilot/metrics`.

## Key files
- SDK: [src/sdk.ts](../src/sdk.ts) (`GitHubAppClient`)
- CLI: [src/cli.ts](../src/cli.ts) (`githubmetrics` entrypoint; auto-loads `.env` via `dotenv/config`)
- Docs/config: [README.md](../README.md), [.env.example](../.env.example), [package.json](../package.json), [tsconfig.json](../tsconfig.json)

## Developer workflows
- Install: `npm install`
- Build: `npm run build` (compiles `src/` → `dist/`)
- Run CLI: `npm run metrics -- --org ORG_NAME` (builds then runs `node --enable-source-maps dist/cli.js`)

## Runtime + module conventions
- ESM project (`"type": "module"`) with TypeScript `moduleResolution: NodeNext`.
- In `src/*.ts`, import local modules using `.js` extensions (e.g. `import { GitHubAppClient } from './sdk.js';`) so the emitted JS runs under Node ESM.
- Uses Node’s built-in `fetch` (assume Node 18+); no HTTP client dependency.

## Auth & GitHub API conventions
- GitHub App JWT is created in `GitHubAppClient.createAppJwt()` using `node:crypto` (RS256), with `iat` backdated 60s and `exp` ~9 minutes.
- Common headers are centralized in `withCommonHeaders()` (`User-Agent`, `X-GitHub-Api-Version`, `Authorization`).
- API calls go through `githubJson()` which throws a single error containing HTTP status + response text; preserve this behavior when adding endpoints.

## Adding new endpoints (pattern)
- Add a method to `GitHubAppClient` that:
	1) gets an installation token if the endpoint needs it,
	2) builds query strings via `buildQuery()`,
	3) calls `githubJson()` with `withCommonHeaders('Bearer ...')`.
- Prefer explicit option types similar to `CopilotMetricsQuery` (keep GitHub’s snake_case query keys like `per_page`).

## Configuration
- CLI/env vars (see [.env.example](../.env.example)):
	- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_ORG`, optional `GITHUB_API_BASE_URL`.
- CLI flags mirror env vars: `--app-id`, `--key-path`, `--org`, `--api-base-url`, plus `--since/--until/--page/--per-page`.

