#!/usr/bin/env node

import 'dotenv/config';

import { GitHubAppClient } from './sdk.js';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function usage(): string {
  return [
    'GitHubMetrics CLI',
    '',
    'Usage:',
    '  githubmetrics --org ORG [--since ISO] [--until ISO] [--page N] [--per-page N]',
    '',
    'Auth (GitHub App installation token):',
    '  --app-id APP_ID                  (or env GITHUB_APP_ID)',
    '  --key-path /path/to/key.pem      (or env GITHUB_APP_PRIVATE_KEY_PATH)',
    '  --api-base-url https://api.github.com (or env GITHUB_API_BASE_URL)',
    '',
    'Examples:',
    '  githubmetrics --org my-org --since 2025-12-01T00:00:00Z',
    '  GITHUB_APP_ID=... GITHUB_APP_PRIVATE_KEY_PATH=... githubmetrics --org my-org',
  ].join('\n');
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    process.stdout.write(usage() + '\n');
    process.exit(0);
  }

  const org = getArg('--org') ?? process.env.GITHUB_ORG;
  const appId = getArg('--app-id') ?? process.env.GITHUB_APP_ID;
  const keyPath = getArg('--key-path') ?? process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const apiBaseUrl = getArg('--api-base-url') ?? process.env.GITHUB_API_BASE_URL;

  if (!org || !appId || !keyPath) {
    process.stderr.write('Missing required config.\n\n' + usage() + '\n');
    process.exit(2);
  }

  const since = getArg('--since');
  const until = getArg('--until');
  const page = getArg('--page');
  const perPage = getArg('--per-page');

  const client = await GitHubAppClient.fromPrivateKeyFile({
    appId,
    privateKeyPath: keyPath,
    apiBaseUrl,
  });

  const metrics = await client.getOrgCopilotMetrics(org, {
    since,
    until,
    page: page ? Number(page) : undefined,
    per_page: perPage ? Number(perPage) : undefined,
  });

  process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
