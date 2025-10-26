import GLib from "gi://GLib";
import Soup from "gi://Soup";

import { logErr, logInfo, logFile } from "../utils/logging.js";
import { ApiCache } from "../data/api_cache.js";

/**
 * Sportradar API client for soccer data
 */
export class SportradarClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.session = new Soup.Session();
    this._decoder = new TextDecoder();
    this._cache = new ApiCache();
    this._pendingRequests = new Map(); // Track in-flight requests to prevent duplicates
  }

  /**
   * Make a GET request to Sportradar API
   */
  async request(endpoint) {
    if (!this.apiKey) {
      logFile(`SKIPPED: ${endpoint} - No API key configured`, 'sportradar-api-calls.log');
      logInfo(`SportradarClient: no API key provided, skipping request to ${endpoint}`, 'SportradarClient');
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
        (session, res) => {
          try {
            const data = session.send_and_read_finish(res);
            if (data) {
              const text = this._decoder.decode(data.toArray());
              // Minimal diagnostic: log non-empty responses length for debugging
              try {
                const json = JSON.parse(text);
                resolve(json);
              } catch (e) {
                logErr(e, "SportradarClient: Failed to parse response");
                logInfo(`SportradarClient: response parse failed for ${endpoint}; length=${text.length}`, 'SportradarClient');
                // Log a truncated preview of the raw response to help debugging (first 1024 chars)
                const preview = text.substring(0, 1024).replace(/\s+/g, ' ').trim();
                logInfo(`SportradarClient: response preview for ${endpoint}: ${preview}`, 'SportradarClient');
                resolve(null);
              }
            } else {
              logInfo(`SportradarClient: empty response for ${endpoint}`, 'SportradarClient');
              resolve(null);
            }
          } catch (error) {
            logErr(error, "SportradarClient: Error in request for " + endpoint);
            logInfo(`SportradarClient: request error for ${endpoint}: ${error}`, 'SportradarClient');
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Fetch all competitions
   */
  async getCompetitions(locale = "en") {
    const cacheKey = `competitions_${locale}`;

    // Try cache first (7 day TTL for competition metadata)
    const cached = await this._cache.get(cacheKey, null, 7);
    if (cached) {
      logFile(`CACHE HIT: competitions (${locale})`, 'sportradar-api-calls.log');
      return cached;
    }

    logFile(`CACHE MISS: competitions (${locale}) - fetching from API`, 'sportradar-api-calls.log');

    const response = await this.request(`${locale}/competitions.json`);

    if (response && Array.isArray(response.competitions)) {
      // Cache the result
      await this._cache.set(cacheKey, response.competitions);
      return response.competitions;
    }

    return [];
  }

  /**
   * Fetch seasons for a competition
   */
  async getSeasonsForCompetition(competitionId, locale = "en") {
    const cacheKey = `seasons_${competitionId}_${locale}`;

    // Try cache first (7 day TTL for season metadata)
    const cached = await this._cache.get(cacheKey, null, 7);
    if (cached) {
      logFile(`CACHE HIT: seasons for competition ${competitionId}`, 'sportradar-api-calls.log');
      return cached;
    }

    logFile(`CACHE MISS: seasons for competition ${competitionId} - fetching from API`, 'sportradar-api-calls.log');

    const response = await this.request(`${locale}/competitions/${competitionId}/seasons.json`);

    if (response && Array.isArray(response.seasons)) {
      // Cache the result
      await this._cache.set(cacheKey, response.seasons);
      return response.seasons;
    }

    return [];
  }

  /**
   * Fetch competitors (teams) for a season
   */
  async getCompetitorsForSeason(seasonId, locale = "en") {
    const cacheKey = `competitors_${seasonId}_${locale}`;

    // Try cache first (7 day TTL for competitor metadata)
    const cached = await this._cache.get(cacheKey, null, 7);
    if (cached) {
      logFile(`CACHE HIT: competitors for season ${seasonId}`, 'sportradar-api-calls.log');
      return cached;
    }

    logFile(`CACHE MISS: competitors for season ${seasonId} - fetching from API`, 'sportradar-api-calls.log');

    const response = await this.request(`${locale}/seasons/${seasonId}/competitors.json`);

    if (response && Array.isArray(response.season_competitors)) {
      // Cache the result
      await this._cache.set(cacheKey, response.season_competitors);
      return response.season_competitors;
    }

    return [];
  }

  /**
   * Fetch competition info including teams
   */
  async getCompetitionInfo(competitionId, locale = "en") {

    // Get seasons for this competition
    const seasons = await this.getSeasonsForCompetition(competitionId, locale);
    if (seasons.length === 0) {
      return null;
    }

    // Find the current season (latest by start_date)
    const currentSeason = seasons.sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];

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
  async getCompetitorSchedules(competitorId, locale = "en") {
    const cacheKey = `competitor_schedules_${competitorId}_${locale}`;

    // Try cache first (1 day TTL for schedules - they change daily)
    const cached = await this._cache.get(cacheKey, null, 1);
    if (cached) {
      logFile(`CACHE HIT: schedules for competitor ${competitorId}`, 'sportradar-api-calls.log');
      return cached;
    }

    // Check if there's already a request in flight for this competitor
    if (this._pendingRequests.has(cacheKey)) {
      logFile(`DEDUPED: waiting for in-flight request for competitor ${competitorId}`, 'sportradar-api-calls.log');
      return await this._pendingRequests.get(cacheKey);
    }

    logFile(`CACHE MISS: schedules for competitor ${competitorId} - fetching from API`, 'sportradar-api-calls.log');

    // Create the request promise and store it
    const requestPromise = (async () => {
      try {
        const response = await this.request(`${locale}/competitors/${competitorId}/schedules.json`);

        if (!response) {
          return null;
        }

        const schedules = response.schedules || [];

        // Cache the result (1 day TTL)
        await this._cache.set(cacheKey, schedules);

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
  destroy() {
    if (this.session) {
      this.session.abort();
    }
  }
}
