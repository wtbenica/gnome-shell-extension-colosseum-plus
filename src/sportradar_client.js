import GLib from "gi://GLib";
import Soup from "gi://Soup";

import { logErr, logInfo } from "./logging/error_utils.js";

/**
 * Sportradar API client for soccer data
 */
export class SportradarClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.session = new Soup.Session();
    this._decoder = new TextDecoder();
  }

  /**
   * Make a GET request to Sportradar API
   */
  async request(endpoint) {
    if (!this.apiKey) {
      try {
        logInfo(`SportradarClient: no API key provided, skipping request to ${endpoint}`, 'SportradarClient');
      } catch (e) {}
      return null;
    }

    const url = `https://api.sportradar.com/soccer/trial/v4/${endpoint}`;
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
                    try {
                      logInfo(`SportradarClient: response parse failed for ${endpoint}; length=${text.length}`, 'SportradarClient');
                      // Log a truncated preview of the raw response to help debugging (first 1024 chars)
                      const preview = text.substring(0, 1024).replace(/\s+/g, ' ').trim();
                      logInfo(`SportradarClient: response preview for ${endpoint}: ${preview}`, 'SportradarClient');
                    } catch (__) {}
                    resolve(null);
                  }
                } else {
                  try { logInfo(`SportradarClient: empty response for ${endpoint}`, 'SportradarClient'); } catch (__) {}
                  resolve(null);
                }
          } catch (error) {
            logErr(error, "SportradarClient: Error in request for " + endpoint);
            try { logInfo(`SportradarClient: request error for ${endpoint}: ${error}`, 'SportradarClient'); } catch (__) {}
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
    const response = await this.request(`${locale}/competitions.json`);
    
    if (response && Array.isArray(response.competitions)) {
      return response.competitions;
    }
    
    return [];
  }

  /**
   * Fetch seasons for a competition
   */
  async getSeasonsForCompetition(competitionId, locale = "en") {
    const response = await this.request(`${locale}/competitions/${competitionId}/seasons.json`);
    
    if (response && Array.isArray(response.seasons)) {
      return response.seasons;
    }
    
    return [];
  }

  /**
   * Fetch competitors (teams) for a season
   */
  async getCompetitorsForSeason(seasonId, locale = "en") {
    const response = await this.request(`${locale}/seasons/${seasonId}/competitors.json`);
    
    if (response && Array.isArray(response.season_competitors)) {
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
    const response = await this.request(`${locale}/competitors/${competitorId}/schedules.json`);

    if (!response) {
      return [];
    }

    // The response shape may contain 'schedules' or 'sport_events' or other top-level arrays
    if (Array.isArray(response.schedules)) {
      return response.schedules;
    }
    if (Array.isArray(response.sport_events)) {
      return response.sport_events;
    }

    // sometimes the API returns an object with 'data' or directly an array
    for (const key of Object.keys(response)) {
      if (Array.isArray(response[key])) return response[key];
    }

    return [];
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
