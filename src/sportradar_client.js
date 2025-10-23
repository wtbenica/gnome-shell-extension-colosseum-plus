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

    const url = `https://api.sportradar.us/soccer/trial/v4/${endpoint}`;
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
   * Fetch competition info including teams
   */
  async getCompetitionInfo(competitionId, locale = "en") {
    logInfo("SportradarClient: Fetching competition info for", competitionId);
    const response = await this.request(`${locale}/competitions/${competitionId}/info.json`);
    
    if (response && response.season && response.season.competitors) {
      logInfo("SportradarClient: Got", response.season.competitors.length, "teams for", competitionId);
      return response;
    }
    
    logInfo("SportradarClient: Failed to fetch competition info for", competitionId);
    return null;
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
