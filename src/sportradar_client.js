import GLib from "gi://GLib";
import Soup from "gi://Soup";

import { logInfo, logErr } from "./logging/error_utils.js";

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
      logInfo("SportradarClient: API key missing");
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
              logInfo("SportradarClient: Response for", endpoint, "- length:", text.length);
              
              try {
                const json = JSON.parse(text);
                resolve(json);
              } catch (e) {
                logErr(e, "SportradarClient: Failed to parse response");
                resolve(null);
              }
            } else {
              logInfo("SportradarClient: No response from endpoint:", endpoint);
              resolve(null);
            }
          } catch (error) {
            logErr(error, "SportradarClient: Error in request for " + endpoint);
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
    logInfo("SportradarClient: Fetching competitions");
    const response = await this.request(`${locale}/competitions.json`);
    
    if (response && Array.isArray(response.competitions)) {
      logInfo("SportradarClient: Got", response.competitions.length, "competitions");
      return response.competitions;
    }
    
    logInfo("SportradarClient: Failed to fetch competitions");
    return [];
  }

  /**
   * Fetch seasons for a competition
   */
  async getSeasonsForCompetition(competitionId, locale = "en") {
    logInfo("SportradarClient: Fetching seasons for competition", competitionId);
    const response = await this.request(`${locale}/competitions/${competitionId}/seasons.json`);
    
    if (response && Array.isArray(response.seasons)) {
      logInfo("SportradarClient: Got", response.seasons.length, "seasons for", competitionId);
      return response.seasons;
    }
    
    logInfo("SportradarClient: Failed to fetch seasons for", competitionId);
    return [];
  }

  /**
   * Fetch competitors (teams) for a season
   */
  async getCompetitorsForSeason(seasonId, locale = "en") {
    logInfo("SportradarClient: Fetching competitors for season", seasonId);
    const response = await this.request(`${locale}/seasons/${seasonId}/competitors.json`);
    
    if (response && Array.isArray(response.season_competitors)) {
      logInfo("SportradarClient: Got", response.season_competitors.length, "competitors for", seasonId);
      return response.season_competitors;
    }
    
    logInfo("SportradarClient: Failed to fetch competitors for", seasonId);
    return [];
  }

  /**
   * Fetch competition info including teams
   */
  async getCompetitionInfo(competitionId, locale = "en") {
    logInfo("SportradarClient: Fetching competition info for", competitionId);
    
    // Get seasons for this competition
    const seasons = await this.getSeasonsForCompetition(competitionId, locale);
    if (seasons.length === 0) {
      logInfo("SportradarClient: No seasons found for", competitionId);
      return null;
    }
    
    // Find the current season (latest by start_date)
    const currentSeason = seasons.sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
    logInfo("SportradarClient: Using season", currentSeason.id, "for", competitionId);
    
    // Get competitors for the current season
    const competitors = await this.getCompetitorsForSeason(currentSeason.id, locale);
    if (competitors.length === 0) {
      logInfo("SportradarClient: No competitors found for season", currentSeason.id);
      return null;
    }
    
    logInfo("SportradarClient: Got", competitors.length, "teams for", competitionId);
    return { season: { competitors: competitors } };
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
