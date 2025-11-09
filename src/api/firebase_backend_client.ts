/**
 * Firebase Backend Client
 * 
 * Replaces direct Sportradar API calls with cached Firebase Cloud Functions.
 * Supports both emulator (local development) and production endpoints.
 */

import Soup from 'gi://Soup?version=3.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { logInfo, logErr, logFile } from '../utils/logging.js';
import type { Competition, Competitor, Season, SportEventBasic } from './types.js';
import { CacheManager, CacheType } from '../data/cache.js';

export interface Country {
  id: string;
  name: string;
  country_code?: string;
  competitionCount?: number;
}

export interface LiveScore {
  eventId: string;
  homeScore?: number;
  awayScore?: number;
  status?: string;
  period?: string;
  matchTime?: string;
}

// Cache TTLs in milliseconds
const CACHE_TTL = {
  COUNTRIES: 24 * 60 * 60 * 1000,      // 1 day
  COMPETITIONS: 6 * 60 * 60 * 1000,    // 6 hours
  SEASONS: 6 * 60 * 60 * 1000,         // 6 hours
  COMPETITORS: 24 * 60 * 60 * 1000,    // 1 day
  SCHEDULES: 10 * 60 * 1000,           // 10 minutes
  LIVE_SCORE: 30 * 1000,               // 30 seconds
};

/**
 * Firebase Backend Client for accessing cached Sportradar data
 */
export class FirebaseBackendClient {
  private baseUrl: string;
  private session: Soup.Session;
  private decoder: TextDecoder;
  private cache: CacheManager;

  constructor(baseUrl?: string) {
    // Default to emulator, can be overridden for production
    this.baseUrl = baseUrl || 'http://127.0.0.1:5001/demo-arena/us-central1';
    this.session = new Soup.Session();
    this.decoder = new TextDecoder();
    
    // Initialize cache with API cache directory
    const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'arena-extension']);
    this.cache = new CacheManager('org.gnome.shell.extensions.arena', cacheDir);
  }

  /**
   * Make HTTP GET request to backend
   */
  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
    let url = `${this.baseUrl}${endpoint}`;
    
    // Add query parameters
    if (params) {
      const queryString = Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      url += `?${queryString}`;
    }

    logFile(`Firebase Backend: ${endpoint}${params ? '?' + JSON.stringify(params) : ''}`, 'firebase-backend-calls.log');

    const message = Soup.Message.new('GET', url);
    message.request_headers.append('Accept', 'application/json');

    return new Promise((resolve) => {
      this.session.send_and_read_async(
        message,
        0, // GLib.PRIORITY_DEFAULT
        null,
        (_session: Soup.Session | null, result: Gio.AsyncResult) => {
          try {
            if (!_session || !result) {
              logErr('Missing session or result', 'FirebaseBackendClient');
              resolve(null);
              return;
            }

            const data = _session.send_and_read_finish(result);
            if (!data) {
              logErr('No data received', 'FirebaseBackendClient');
              resolve(null);
              return;
            }

            // Handle response data
            let bytes: Uint8Array | null = null;
            if (typeof data.toArray === 'function') {
              const arr = data.toArray();
              bytes = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
            } else if (data instanceof Uint8Array) {
              bytes = data;
            } else if (Array.isArray(data)) {
              bytes = new Uint8Array(data);
            }

            if (bytes) {
              const text = this.decoder.decode(bytes);
              try {
                const json = JSON.parse(text);
                
                // Check for error response
                if (json.error) {
                  logErr(`Backend error: ${json.error}`, 'FirebaseBackendClient');
                  resolve(null);
                  return;
                }

                resolve(json as T);
              } catch (e) {
                logErr(e, `Failed to parse response from ${endpoint}`);
                resolve(null);
              }
            } else {
              logErr('Could not extract bytes from response', 'FirebaseBackendClient');
              resolve(null);
            }
          } catch (error) {
            logErr(error, `Request error for ${endpoint}`);
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Get list of available countries
   */
  async getCountries(): Promise<Country[]> {
    const cacheKey = 'countries';
    const cached = this.cache.get<Country[]>(cacheKey, CacheType.API, CACHE_TTL.COUNTRIES);
    if (cached) {
      return cached;
    }

    const response = await this.request<{ categories: Country[] }>('/getCountries');
    const countries = response?.categories || [];
    
    if (countries.length > 0) {
      this.cache.set(cacheKey, countries, CacheType.API);
    }
    
    return countries;
  }

  /**
   * Get competitions for a specific country
   */
  async getCompetitionsForCountry(country: string): Promise<Competition[]> {
    const cacheKey = `competitions-country-${country}`;
    const cached = this.cache.get<Competition[]>(cacheKey, CacheType.API, CACHE_TTL.COMPETITIONS);
    if (cached) {
      return cached;
    }

    const response = await this.request<{ competitions: Competition[] }>(
      '/getCompetitions',
      { country }
    );
    const competitions = response?.competitions || [];
    
    if (competitions.length > 0) {
      this.cache.set(cacheKey, competitions, CacheType.API);
    }
    
    return competitions;
  }

  /**
   * Get all competitions
   */
  async getCompetitions(): Promise<Competition[]> {
    const cacheKey = 'competitions-all';
    const cached = this.cache.get<Competition[]>(cacheKey, CacheType.API, CACHE_TTL.COMPETITIONS);
    if (cached) {
      return cached;
    }

    const response = await this.request<{ competitions: Competition[] }>('/getCompetitions');
    const competitions = response?.competitions || [];
    
    if (competitions.length > 0) {
      this.cache.set(cacheKey, competitions, CacheType.API);
    }
    
    return competitions;
  }

  /**
   * Get seasons for a competition
   */
  async getSeasons(competitionId: string): Promise<Season[]> {
    const cacheKey = `seasons-${competitionId}`;
    const cached = this.cache.get<Season[]>(cacheKey, CacheType.API, CACHE_TTL.SEASONS);
    if (cached) {
      return cached;
    }

    const response = await this.request<{ seasons: Season[] }>(
      '/getSeasons',
      { competitionId }
    );
    const seasons = response?.seasons || [];
    
    if (seasons.length > 0) {
      this.cache.set(cacheKey, seasons, CacheType.API);
    }
    
    return seasons;
  }

  /**
   * Get competitors for a season
   */
  async getCompetitors(competitionId: string, seasonId: string): Promise<Competitor[]> {
    const cacheKey = `competitors-${competitionId}-${seasonId}`;
    const cached = this.cache.get<Competitor[]>(cacheKey, CacheType.API, CACHE_TTL.COMPETITORS);
    if (cached) {
      return cached;
    }

    const response = await this.request<{ competitors: Competitor[] }>(
      '/getCompetitors',
      { competitionId, seasonId }
    );
    const competitors = response?.competitors || [];
    
    if (competitors.length > 0) {
      this.cache.set(cacheKey, competitors, CacheType.API);
    }
    
    return competitors;
  }

  /**
   * Get schedules for a competitor
   */
  async getSchedules(competitorId: string): Promise<SportEventBasic[]> {
    const cacheKey = `schedules-${competitorId}`;
    const cached = this.cache.get<SportEventBasic[]>(cacheKey, CacheType.API, CACHE_TTL.SCHEDULES);
    if (cached) {
      return cached;
    }

    const response = await this.request<{ schedules: SportEventBasic[] }>(
      '/getSchedules',
      { competitorId }
    );
    const schedules = response?.schedules || [];
    
    if (schedules.length > 0) {
      this.cache.set(cacheKey, schedules, CacheType.API);
    }
    
    return schedules;
  }

  /**
   * Get dynamic constants
   */
  async getConstants(): Promise<Record<string, unknown>> {
    const response = await this.request<Record<string, unknown>>('/getConstants');
    return response || {};
  }

  /**
   * Get live score for an event
   */
  async getLiveScore(eventId: string): Promise<LiveScore | null> {
    const cacheKey = `live-score-${eventId}`;
    const cached = this.cache.get<LiveScore>(cacheKey, CacheType.API, CACHE_TTL.LIVE_SCORE);
    if (cached) {
      return cached;
    }

    const response = await this.request<{ live: { sport_event_status?: { home_score?: number; away_score?: number; match_status?: string; status?: string } } }>('/getLiveScore', { eventId });
    
    if (!response?.live?.sport_event_status) {
      return null;
    }

    const status = response.live.sport_event_status;
    const liveScore: LiveScore = {
      eventId,
      homeScore: status.home_score,
      awayScore: status.away_score,
      status: status.match_status || status.status || '',
      period: '',
      matchTime: ''
    };
    
    this.cache.set(cacheKey, liveScore, CacheType.API);
    return liveScore;
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clearAll(CacheType.API);
    logInfo('Firebase backend cache cleared', 'FirebaseBackendClient');
  }

  /**
   * Set production URL (call this after construction to switch from emulator)
   */
  setProductionUrl(url: string): void {
    this.baseUrl = url;
    logInfo(`Firebase backend URL set to: ${url}`, 'FirebaseBackendClient');
  }

  /**
   * Check if using emulator
   */
  isUsingEmulator(): boolean {
    return this.baseUrl.includes('127.0.0.1') || this.baseUrl.includes('localhost');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.session) {
      (this.session as { abort: () => void }).abort();
    }
    this.cache.destroy();
  }
}

export {};
