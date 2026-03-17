import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  CourseResult,
  IPlatformAdapter,
  PlatformConfig,
} from '../interfaces/platform-adapter.interface';

interface SalesforceTokenResponse {
  access_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
}

interface SFSoslSearchResult {
  searchRecords?: Array<Record<string, unknown>>;
}

/**
 * Trailhead Adapter — Salesforce OAuth 2.0 + REST API (Option D)
 *
 * Requires the following fields in `LearningPlatform.config` (JSON):
 *   - clientId       → Connected App Consumer Key
 *   - clientSecret   → Connected App Consumer Secret
 *   - instanceUrl    → e.g. "https://mydomain.my.salesforce.com" (optional, falls back to login.salesforce.com)
 *
 * Flow:
 *  1. Request access token via client_credentials OAuth grant.
 *  2. Cache token in memory (expires in ~1h, re-fetched when needed).
 *  3. Run SOSL search against TrailheadModule__c (or similar) objects.
 */
export class TrailheadAdapter implements IPlatformAdapter {
  readonly platformName = 'Trailhead';
  private readonly logger = new Logger(TrailheadAdapter.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private cachedInstanceUrl: string | null = null;

  private readonly SF_API_VERSION = 'v62.0';
  private readonly LOGIN_URL = 'https://login.salesforce.com';
  private readonly TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5 min early refresh

  constructor(
    private readonly http: HttpService,
    private readonly platform: PlatformConfig,
  ) {}

  // ─── Public Search ───────────────────────────────────────────────────────

  async search(query: string, limit: number): Promise<CourseResult[]> {
    const cfg = this.platform.config as Record<string, string>;
    const { clientId, clientSecret } = cfg;

    if (!clientId || !clientSecret) {
      this.logger.warn(
        `[Trailhead] clientId / clientSecret não configurados. Ignorando pesquisa.`,
      );
      return [];
    }

    try {
      this.logger.log(`[Trailhead] A pesquisar: "${query}"`);

      const token = await this.getAccessToken(clientId, clientSecret, cfg.instanceUrl);
      const instanceUrl = this.cachedInstanceUrl ?? (cfg.instanceUrl || this.LOGIN_URL);

      const results = await this.soslSearch(instanceUrl, token, query, limit);
      return results;
    } catch (error: any) {
      this.logger.error(`[Trailhead] Erro ao pesquisar: ${String(error?.message ?? error)}`);
      return [];
    }
  }

  // ─── OAuth Token ─────────────────────────────────────────────────────────

  private async getAccessToken(
    clientId: string,
    clientSecret: string,
    instanceUrl?: string,
  ): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && now < this.tokenExpiresAt - this.TOKEN_BUFFER_MS) {
      return this.cachedToken;
    }

    const loginUrl = instanceUrl || this.LOGIN_URL;
    const tokenUrl = `${loginUrl}/services/oauth2/token`;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await firstValueFrom(
      this.http
        .post<SalesforceTokenResponse>(tokenUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        .pipe(timeout(10_000)),
    );

    const { access_token, instance_url, issued_at } = response.data;

    this.cachedToken = access_token;
    this.cachedInstanceUrl = instance_url;
    // Salesforce tokens last 1 hour (3600s). `issued_at` is a Unix ms timestamp.
    this.tokenExpiresAt = Number(issued_at) + 3600 * 1000;

    this.logger.log(`[Trailhead] Token OAuth obtido. Instância: ${instance_url}`);
    return access_token;
  }

  // ─── SOSL Search ─────────────────────────────────────────────────────────

  /**
   * Searches using Salesforce SOSL (Salesforce Object Search Language).
   * Example: FIND {apex} IN ALL FIELDS RETURNING TrailheadModule__c(Name,Description__c,URL__c)
   *
   * Note: The exact Salesforce Object and field names depend on your org's schema.
   * The query below targets the most common object names used in enabled myTrailhead orgs.
   */
  private async soslSearch(
    instanceUrl: string,
    token: string,
    query: string,
    limit: number,
  ): Promise<CourseResult[]> {
    const escapedQuery = query.replace(/['"]/g, ' ').trim();

    // Build SOSL query — searches TrailheadModule__c if available, falls back to broader search
    const sosl = [
      `FIND {${escapedQuery}} IN ALL FIELDS`,
      `RETURNING TrailheadModule__c(Id, Name, Description__c, URL__c, DurationMinutes__c, Level__c LIMIT ${limit})`,
    ].join(' ');

    const url = `${instanceUrl}/services/data/${this.SF_API_VERSION}/search/`;

    const response = await firstValueFrom(
      this.http
        .get<SFSoslSearchResult>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          params: { q: sosl },
        })
        .pipe(timeout(15_000)),
    );

    const records = response.data?.searchRecords ?? [];
    return records.map((r) => this.normalize(r));
  }

  // ─── Normalize ───────────────────────────────────────────────────────────

  private normalize(item: Record<string, unknown>): CourseResult {
    const rawUrl = String(item['URL__c'] ?? '');
    const url = rawUrl.startsWith('http')
      ? rawUrl
      : `https://trailhead.salesforce.com${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

    const rawLevel = String(item['Level__c'] ?? '').toLowerCase();
    const level: CourseResult['level'] = rawLevel.includes('beginner')
      ? 'beginner'
      : rawLevel.includes('advanced')
        ? 'advanced'
        : rawLevel.includes('intermediate')
          ? 'intermediate'
          : undefined;

    const durationMinutes = Number(item['DurationMinutes__c']);
    const durationHours = durationMinutes > 0
      ? parseFloat((durationMinutes / 60).toFixed(2))
      : undefined;

    return {
      externalId: `trailhead:${String(item['Id'] ?? Buffer.from(url).toString('base64').slice(0, 30))}`,
      title: String(item['Name'] ?? 'Módulo Trailhead'),
      description: String(item['Description__c'] ?? ''),
      url,
      level,
      durationHours,
      tags: [],
      platformId: this.platform.id,
      platformName: this.platformName,
    };
  }
}
