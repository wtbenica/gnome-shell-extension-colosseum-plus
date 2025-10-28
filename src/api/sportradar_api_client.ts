import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { logErr, logWarn, logFile } from "../utils/logging.js";
import { ApiCache } from "../data/api_cache.js";
import type { 
  Competition, 
  Competitor,
  CompetitionsApiResponse,
  SeasonsApiResponse,
  CompetitorsApiResponse,
  SchedulesApiResponse
} from "../api/types.js";
import type { SportEventBasic } from "../api/types.js";
import { isCompetitionArray, isCompetitorArray, isSportEventBasicArray } from "../api/typeguards.js";

/**
 * Sportradar API client for soccer data
 */
export class SportradarClient {
  apiKey: string;
  session: Soup.Session;
  _decoder: TextDecoder;
  _cache: ApiCache;
  _pendingRequests: Map<string, Promise<SportEventBasic[] | null>>;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.session = new Soup.Session();
    this._decoder = new TextDecoder();
    this._cache = new ApiCache();
    this._pendingRequests = new Map(); // Track in-flight requests to prevent duplicates
  }

  /**
   * Make a GET request to Sportradar API
   */
  async request<T = unknown>(endpoint: string, schema?: (x: unknown) => x is T): Promise<T | null> {
    if (!this.apiKey) {
      logFile(`SKIPPED: ${endpoint} - No API key configured`, 'sportradar-api-calls.log');
      logWarn(`SportradarClient: no API key provided, skipping request to ${endpoint}`, 'SportradarClient');
      return null;
    }

    const url = `https://api.sportradar.com/soccer/trial/v4/${endpoint}`;

    // Log the API call to file for tracking
    logFile(`API CALL: ${endpoint}`, 'sportradar-api-calls.log');

    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-api-key", this.apiKey);
    message.request_headers.append("accept", "application/json");

    return new Promise((resolve) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session: Soup.Session | null, res: Gio.AsyncResult | null) => {
          try {
            if (!session || !res) {
              logWarn(`SportradarClient: missing session or result for ${endpoint}`, 'SportradarClient');
              resolve(null);
              return;
            }
            const data = session.send_and_read_finish(res);
            if (data) {
              // Handle a few possible shapes returned by the Soup response
              let bytes: Uint8Array | null = null;
              if (typeof data.toArray === 'function') {
                const arr = data.toArray();
                bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
              } else if (data instanceof Uint8Array) {
                bytes = data;
              } else if (Array.isArray(data)) {
                bytes = new Uint8Array(data);
              } else if (typeof data === 'string') {
                try {
                  const json = JSON.parse(data);
                  resolve(json);
                  return;
                } catch {
                  // fallthrough to try decode
                }
                bytes = new TextEncoder().encode(data);
              }

              if (bytes) {
                const text = this._decoder.decode(bytes);
                try {
                  const json = JSON.parse(text);
                  if (schema) {
                    try {
                      if (schema(json)) {
                        resolve(json as T);
                      } else {
                        logWarn(`SportradarClient: validation predicate failed for ${endpoint}`, 'SportradarClient');
                        resolve(null);
                      }
                    } catch (e) {
                      logErr(e, `SportradarClient: validation predicate threw for ${endpoint}`);
                      resolve(null);
                    }
                  } else {
                    resolve(json as T);
                  }
                } catch (e) {
                  logErr(e, "SportradarClient: Failed to parse response");
                  logWarn(`SportradarClient: response parse failed for ${endpoint}; length=${text.length}`, 'SportradarClient');
                  const preview = text.substring(0, 1024).replace(/\s+/g, ' ').trim();
                  logWarn(`SportradarClient: response preview for ${endpoint}: ${preview}`, 'SportradarClient');
                  resolve(null);
                }
              } else {
                logWarn(`SportradarClient: empty/unknown response shape for ${endpoint}`, 'SportradarClient');
                resolve(null);
              }
            } else {
              logWarn(`SportradarClient: empty response for ${endpoint}`, 'SportradarClient');
              resolve(null);
            }
          } catch (error) {
            logErr(error, "SportradarClient: Error in request for " + endpoint);
            logWarn(`SportradarClient: request error for ${endpoint}: ${error}`, 'SportradarClient');
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Fetch all competitions
   */
  async getCompetitions(locale: string = "en"): Promise<Competition[]> {
    const cacheKey = `competitions_${locale}`;

    // Try cache first (7 day TTL for competition metadata)
    const cached = await this._cache.get<Competition[]>(cacheKey, null, 7, isCompetitionArray);
    if (cached) {
      logFile(`CACHE HIT: competitions (${locale})`, 'sportradar-api-calls.log');
      return cached as Competition[];
    }

    logFile(`CACHE MISS: competitions (${locale}) - fetching from API`, 'sportradar-api-calls.log');

    const response = await this.request<CompetitionsApiResponse>(`${locale}/competitions.json`);

    if (response && Array.isArray(response.competitions) && isCompetitionArray(response.competitions)) {
      await this._cache.set<Competition[]>(cacheKey, response.competitions, null, isCompetitionArray);
      return response.competitions;
    }

    return [];
  }

  /**
   * Fetch seasons for a competition
   */
  async getSeasonsForCompetition(competitionId: string, locale: string = "en"): Promise<Array<{ id: string; start_date?: string }>> {
    const cacheKey = `seasons_${competitionId}_${locale}`;

    // Try cache first (7 day TTL for season metadata)
    const cached = await this._cache.get<Array<{ id: string; start_date?: string }>>(cacheKey, null, 7);
    if (cached) {
      logFile(`CACHE HIT: seasons for competition ${competitionId}`, 'sportradar-api-calls.log');
      return cached;
    }

    logFile(`CACHE MISS: seasons for competition ${competitionId} - fetching from API`, 'sportradar-api-calls.log');

    const response = await this.request<SeasonsApiResponse>(`${locale}/competitions/${competitionId}/seasons.json`);
    if (response && Array.isArray(response.seasons)) {
      await this._cache.set<Array<{ id: string; start_date?: string }>>(cacheKey, response.seasons, null);
      return response.seasons;
    }

    return [];
  }

  /**
   * Fetch competitors (teams) for a season
   */
  async getCompetitorsForSeason(seasonId: string, locale: string = "en"): Promise<Competitor[]> {
    const cacheKey = `competitors_${seasonId}_${locale}`;

    // Try cache first (7 day TTL for competitor metadata)
    const cached = await this._cache.get<Competitor[]>(cacheKey, null, 7, isCompetitorArray);
    if (cached) {
      logFile(`CACHE HIT: competitors for season ${seasonId}`, 'sportradar-api-calls.log');
      return cached;
    }

    logFile(`CACHE MISS: competitors for season ${seasonId} - fetching from API`, 'sportradar-api-calls.log');

    const response = await this.request<CompetitorsApiResponse>(`${locale}/seasons/${seasonId}/competitors.json`);
    if (response && Array.isArray(response.season_competitors) && isCompetitorArray(response.season_competitors)) {
      await this._cache.set<Competitor[]>(cacheKey, response.season_competitors, null, isCompetitorArray);
      return response.season_competitors;
    }

    return [];
  }

  /**
   * Fetch competition info including teams
   */
  async getCompetitionInfo(competitionId: string, locale: string = "en"): Promise<{ season?: { competitors?: Competitor[] } } | null> {

    // Get seasons for this competition
    const seasons = await this.getSeasonsForCompetition(competitionId, locale);
    if (seasons.length === 0) {
      return null;
    }

    // Find the current season (latest by start_date)
    const currentSeason = seasons.sort((a, b) => {
      const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
      const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
      return dateB - dateA;
    })[0];

    // Get competitors for the current season
    const competitors = await this.getCompetitorsForSeason(currentSeason.id, locale);
    if (competitors.length === 0) {
      return null;
    }

    return { season: { competitors: competitors } };
  }

  /**
   * Fetch schedules (previous and upcoming) for a competitor
   */
  async getCompetitorSchedules(competitorId: string, locale: string = "en"): Promise<SportEventBasic[] | null> {
    const cacheKey = `competitor_schedules_${competitorId}_${locale}`;

    // Try cache first (1 day TTL for schedules - they change daily)
    const cached = await this._cache.get<SportEventBasic[]>(cacheKey, null, 1, isSportEventBasicArray);
    if (cached) {
      logFile(`CACHE HIT: schedules for competitor ${competitorId}`, 'sportradar-api-calls.log');
      return cached;
    }

    // Check if there's already a request in flight for this competitor
    if (this._pendingRequests.has(cacheKey)) {
      logFile(`DEDUPED: waiting for in-flight request for competitor ${competitorId}`, 'sportradar-api-calls.log');
      return await (this._pendingRequests.get(cacheKey) as Promise<SportEventBasic[] | null>);
    }

    logFile(`CACHE MISS: schedules for competitor ${competitorId} - fetching from API`, 'sportradar-api-calls.log');

    // Create the request promise and store it
    const requestPromise = (async () => {
      try {
        const response = await this.request<SchedulesApiResponse>(`${locale}/competitors/${competitorId}/schedules.json`);
        if (!response) return null;
        const schedules = response.schedules || [];
        if (!Array.isArray(schedules) || !isSportEventBasicArray(schedules)) return null;
        // Cache the result (1 day TTL)
        await this._cache.set<SportEventBasic[]>(cacheKey, schedules, null, isSportEventBasicArray);
        return schedules;
      } finally {
        // Remove from pending requests when complete
        this._pendingRequests.delete(cacheKey);
      }
    })();

    // Store the promise so other concurrent calls can await it
    this._pendingRequests.set(cacheKey, requestPromise);

    return await requestPromise;
  }

  /**
   * Close the session
   */
  destroy(): void {
    if (this.session) {
      (this.session as { abort: () => void }).abort();
    }
  }
}
