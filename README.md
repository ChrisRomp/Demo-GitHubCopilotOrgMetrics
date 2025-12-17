# GitHubMetrics

Small TypeScript SDK + CLI to fetch GitHub Copilot **organization** metrics using a **GitHub App installation token** (no user PAT/OAuth).

## Setup

1) Install dependencies

- `npm install`

2) Create a `.env` (or export env vars)

- `GITHUB_APP_ID` = your GitHub App **App ID** (numeric)
- `GITHUB_APP_PRIVATE_KEY_PATH` = absolute path to your `.pem`
- `GITHUB_ORG` = org login
- (optional) `GITHUB_API_BASE_URL` = GitHub API base URL (default `https://api.github.com`)

You can use [.env.example](.env.example) as a template. The CLI loads `.env` automatically.

## Build

- `npm run build`

## Run (CLI)

- `npm run metrics -- --org ORG_NAME`

Optional query params:

- `--since 2025-12-01T00:00:00Z`
- `--until 2025-12-15T00:00:00Z`
- `--page 1`
- `--per-page 100`

## Notes

- The GitHub App must be installed on the org and granted permissions required by the Copilot metrics API (see GitHub docs for required org permissions).
- Enterprise-level Copilot metrics endpoints do **not** accept GitHub App installation tokens; use org/team endpoints instead.
