/**
 * Firebase Backend Client
 * 
 * Replaces direct Sportradar API calls with cached Firebase Cloud Functions.
 * Supports both emulator (local development) and production endpoints.
 */

import Soup from 'gi://Soup?version=3.0';
import Gio from 'gi://Gio';
import { logInfo, logErr, logFile } from '../utils/logging.js';
import type { Competition, Competitor, Season, SportEventBasic } from './types.js';

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

/**
 * Firebase Backend Client for accessing cached Sportradar data
 */
export class FirebaseBackendClient {
  private baseUrl: string;
  private session: Soup.Session;
  private decoder: TextDecoder;

  constructor(baseUrl?: string) {
    // Default to emulator, can be overridden for production
    this.baseUrl = baseUrl || 'http://127.0.0.1:5001/demo-colosseum/us-central1';
    this.session = new Soup.Session();
    this.decoder = new TextDecoder();
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
    const response = await this.request<{ categories: Country[] }>('/getCountries');
    return response?.categories || [];
  }

  /**
   * Get competitions for a specific country
   */
  async getCompetitionsForCountry(country: string): Promise<Competition[]> {
    const response = await this.request<{ competitions: Competition[] }>(
      '/getCompetitions',
      { country }
    );
    return response?.competitions || [];
  }

  /**
   * Get all competitions
   */
  async getCompetitions(): Promise<Competition[]> {
    const response = await this.request<{ competitions: Competition[] }>('/getCompetitions');
    return response?.competitions || [];
  }

  /**
   * Get seasons for a competition
   */
  async getSeasons(competitionId: string): Promise<Season[]> {
    const response = await this.request<{ seasons: Season[] }>(
      '/getSeasons',
      { competitionId }
    );
    return response?.seasons || [];
  }

  /**
   * Get competitors for a season
   */
  async getCompetitors(competitionId: string, seasonId: string): Promise<Competitor[]> {
    const response = await this.request<{ competitors: Competitor[] }>(
      '/getCompetitors',
      { competitionId, seasonId }
    );
    return response?.competitors || [];
  }

  /**
   * Get schedules for a competitor
   */
  async getSchedules(competitorId: string): Promise<SportEventBasic[]> {
    const response = await this.request<{ schedules: SportEventBasic[] }>(
      '/getSchedules',
      { competitorId }
    );
    return response?.schedules || [];
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
    const response = await this.request<{ live: LiveScore }>('/getLiveScore', { eventId });
    return response?.live || null;
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
  }
}

export {};
