#!/usr/bin/env node

import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
    '  githubmetrics --org ORG --reports [--report-kind organization|users] [--report-period 1-day|28-day] [--day YYYY-MM-DD] [--download [DIR]]',
    '',
    'Auth (GitHub App installation token):',
    '  --app-id APP_ID                  (or env GITHUB_APP_ID)',
    '  --key-path /path/to/key.pem      (or env GITHUB_APP_PRIVATE_KEY_PATH)',
    '  --api-base-url https://api.github.com (or env GITHUB_API_BASE_URL)',
    '',
    'Examples:',
    '  githubmetrics --org my-org --since 2025-12-01T00:00:00Z',
    '  githubmetrics --org my-org --reports --report-kind organization --report-period 28-day',
    '  githubmetrics --org my-org --reports --report-kind users --report-period 1-day --day 2025-12-01',
    '  githubmetrics --org my-org --reports --report-kind organization --report-period 28-day --download ./reports',
    '  GITHUB_APP_ID=... GITHUB_APP_PRIVATE_KEY_PATH=... githubmetrics --org my-org',
  ].join('\n');
}

async function downloadReportFiles(downloadLinks: string[], outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });

  const downloaded: string[] = [];
  for (let i = 0; i < downloadLinks.length; i++) {
    const url = downloadLinks[i];

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Download error ${res.status} ${res.statusText} for GET ${url}${text ? `: ${text}` : ''}`
      );
    }

    const body = await res.text();

    let filename = `report-${i + 1}.json`;
    try {
      const parsed = new URL(url);
      const base = path.basename(parsed.pathname);
      if (base) filename = base;
    } catch {
      // ignore URL parse failures; keep fallback filename
    }

    // Avoid writing outside outDir (e.g. if basename returns '.' or '..')
    filename = path.basename(filename);
    if (!filename || filename === '.' || filename === '..') {
      filename = `report-${i + 1}.json`;
    }
    if (!path.extname(filename)) {
      filename = `${filename}.json`;
    }

    const fullPath = path.join(outDir, filename);
    await writeFile(fullPath, body, 'utf8');
    downloaded.push(fullPath);
  }

  return downloaded;
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

  const useReports = hasFlag('--reports');
  const reportKind = getArg('--report-kind');
  const reportPeriod = getArg('--report-period');
  const day = getArg('--day');

  const downloadFlag = hasFlag('--download');
  const downloadDir = getArg('--download') ?? '.';

  const client = await GitHubAppClient.fromPrivateKeyFile({
    appId,
    privateKeyPath: keyPath,
    apiBaseUrl,
  });

  if (useReports) {
    const report = await client.getOrgCopilotUsageMetricsReport(org, {
      kind: (reportKind as 'organization' | 'users' | undefined) ?? undefined,
      period: (reportPeriod as '1-day' | '28-day' | undefined) ?? undefined,
      day,
    });

    if (downloadFlag) {
      const downloadedFiles = await downloadReportFiles(report.download_links, downloadDir);
      process.stdout.write(JSON.stringify({ ...report, downloaded_files: downloadedFiles }, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    }
  } else {
    if (downloadFlag) {
      throw new Error("'--download' is only supported with '--reports'.");
    }
    const metrics = await client.getOrgCopilotMetrics(org, {
      since,
      until,
      page: page ? Number(page) : undefined,
      per_page: perPage ? Number(perPage) : undefined,
    });

    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
