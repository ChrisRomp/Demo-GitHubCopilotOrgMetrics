import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

export type GitHubApiOptions = {
  apiBaseUrl?: string;
  userAgent?: string;
  apiVersion?: string;
};

export type GitHubAppAuthOptions = GitHubApiOptions & {
  appId: string | number;
  privateKeyPem: string;
};

export type InstallationAccessTokenResponse = {
  token: string;
  expires_at: string;
};

export type CopilotMetricsQuery = {
  since?: string;
  until?: string;
  page?: number;
  per_page?: number;
};

export type CopilotUsageMetricsReportKind = 'organization' | 'users';
export type CopilotUsageMetricsReportPeriod = '1-day' | '28-day';

export type CopilotUsageMetricsReportOptions = {
  kind?: CopilotUsageMetricsReportKind;
  period?: CopilotUsageMetricsReportPeriod;
  /** Required when period is '1-day'. Format: YYYY-MM-DD */
  day?: string;
};

export type CopilotUsageMetricsReportResponse = {
  download_links: string[];
  report_day?: string;
  report_start_day?: string;
  report_end_day?: string;
};

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    searchParams.set(key, String(value));
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

async function githubJson<T>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    ...options.headers,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const msg = `GitHub API error ${res.status} ${res.statusText} for ${method} ${url}${text ? `: ${text}` : ''}`;
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

export class GitHubAppClient {
  private readonly appId: string;
  private readonly privateKeyPem: string;
  private readonly apiBaseUrl: string;
  private readonly userAgent: string;
  private readonly apiVersion: string;

  constructor(options: GitHubAppAuthOptions) {
    this.appId = String(options.appId);
    this.privateKeyPem = options.privateKeyPem;
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
    this.userAgent = options.userAgent ?? 'GitHubMetrics/1.0';
    this.apiVersion = options.apiVersion ?? '2022-11-28';
  }

  createAppJwt(now: Date = new Date()): string {
    const iat = Math.floor(now.getTime() / 1000) - 60;
    const exp = iat + 9 * 60;

    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = { iat, exp, iss: this.appId };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), {
      key: this.privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    });

    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  private withCommonHeaders(authHeader: string): Record<string, string> {
    return {
      Authorization: authHeader,
      'User-Agent': this.userAgent,
      'X-GitHub-Api-Version': this.apiVersion,
    };
  }

  async getOrgInstallationId(org: string): Promise<number> {
    const jwt = this.createAppJwt();
    const url = `${this.apiBaseUrl}/orgs/${encodeURIComponent(org)}/installation`;

    const data = await githubJson<{ id: number }>(url, {
      headers: this.withCommonHeaders(`Bearer ${jwt}`),
    });

    return data.id;
  }

  async createInstallationAccessToken(installationId: number): Promise<InstallationAccessTokenResponse> {
    const jwt = this.createAppJwt();
    const url = `${this.apiBaseUrl}/app/installations/${installationId}/access_tokens`;

    return await githubJson<InstallationAccessTokenResponse>(url, {
      method: 'POST',
      headers: this.withCommonHeaders(`Bearer ${jwt}`),
    });
  }

  async getInstallationAccessTokenForOrg(org: string): Promise<InstallationAccessTokenResponse> {
    const installationId = await this.getOrgInstallationId(org);
    return await this.createInstallationAccessToken(installationId);
  }

  async getOrgCopilotMetrics(org: string, query: CopilotMetricsQuery = {}): Promise<unknown> {
    const { token } = await this.getInstallationAccessTokenForOrg(org);

    const qs = buildQuery({
      since: query.since,
      until: query.until,
      page: query.page,
      per_page: query.per_page,
    });

    const url = `${this.apiBaseUrl}/orgs/${encodeURIComponent(org)}/copilot/metrics${qs}`;

    return await githubJson<unknown>(url, {
      headers: this.withCommonHeaders(`Bearer ${token}`),
    });
  }

  async getOrgCopilotUsageMetricsReport(
    org: string,
    options: CopilotUsageMetricsReportOptions = {}
  ): Promise<CopilotUsageMetricsReportResponse> {
    const { token } = await this.getInstallationAccessTokenForOrg(org);

    const kind: CopilotUsageMetricsReportKind = options.kind ?? 'organization';
    const period: CopilotUsageMetricsReportPeriod = options.period ?? '28-day';

    if (period === '1-day') {
      if (!options.day) {
        throw new Error("Missing required 'day' for 1-day report. Expected YYYY-MM-DD.");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(options.day)) {
        throw new Error("Invalid 'day' format. Expected YYYY-MM-DD.");
      }
    }

    const reportPath =
      period === '28-day'
        ? `${kind}-28-day/latest`
        : `${kind}-1-day${buildQuery({ day: options.day })}`;

    const url = `${this.apiBaseUrl}/orgs/${encodeURIComponent(org)}/copilot/metrics/reports/${reportPath}`;

    return await githubJson<CopilotUsageMetricsReportResponse>(url, {
      headers: this.withCommonHeaders(`Bearer ${token}`),
    });
  }

  static async fromPrivateKeyFile(options: GitHubApiOptions & { appId: string | number; privateKeyPath: string }): Promise<GitHubAppClient> {
    const pem = await readFile(options.privateKeyPath, 'utf8');
    return new GitHubAppClient({
      appId: options.appId,
      privateKeyPem: pem,
      apiBaseUrl: options.apiBaseUrl,
      userAgent: options.userAgent,
      apiVersion: options.apiVersion,
    });
  }
}
