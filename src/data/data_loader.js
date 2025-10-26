import GLib from "gi://GLib";
import Soup from "gi://Soup";
import Gio from "gi://Gio";

import { CacheManager } from "./local_cache_manager.js";
import { loadEnv } from "../config/env_loader.js";
import { SportradarClient } from "../api/sportradar_api_client.js";
import { logErr } from "../utils/logging.js";

const env = loadEnv();
const SPORT_RADAR_KEY = env.SPORT_RADAR_KEY;

class DataLoaderClass {
  constructor() {
    this.cacheManager = new CacheManager();
    this.sportradarClient = new SportradarClient(SPORT_RADAR_KEY);
  }

  async fetchCompetitions() {
    
    // Define the target leagues mapping
    const targetLeagues = {
      'Premier League': { id: 'sr:competition:17', category: 'England' },
      'LaLiga': { id: 'sr:competition:8', category: 'Spain' },
      'MLS': { id: 'sr:competition:242', category: 'USA' },
      'Liga MX': { id: 'sr:competition:27464', category: 'Mexico' } // Apertura child competition
    };

    // Check cache first
    const cachedCompetitions = this.cacheManager.getRawCompetitions();
    // If cache exists, synthesize a competitions list that guarantees entries for our target leagues.
    if (cachedCompetitions.length > 0) {
      const cacheById = new Map(cachedCompetitions.map(c => [c.id, c]));
      const result = [];
      for (const [name, details] of Object.entries(targetLeagues)) {
        if (cacheById.has(details.id)) {
          result.push(cacheById.get(details.id));
        } else {
          // create a lightweight placeholder so the UI can show the league header immediately
          result.push({ id: details.id, name: name, category: details.category, _placeholder: true });
        }
      }
      return result;
    }

    // Fetch from API
    const competitions = await this.sportradarClient.getCompetitions();
    if (competitions.length > 0) {
            // Filter to only the 4 target leagues
      // Filter to only the 4 target leagues (use the same mapping defined above)
      const filteredCompetitions = competitions.filter(comp => {
        for (const details of Object.values(targetLeagues)) {
          if (comp.id === details.id) {
            return true;
          }
        }
        return false;
      });
      // Update cache with competitions. Preserve any existing leagues/teams in cache.
      const currentLeagues = this.cacheManager.getLeagues();
      const currentTeams = this.cacheManager.data.teams || {};
      // save(leagues, teams, rawCompetitions)
      this.cacheManager.save(currentLeagues, currentTeams, filteredCompetitions);
      return filteredCompetitions;
    }
    return [];
  }

  async fetchCompetitionInfo(competitionId) {
    
    // Check cache first
    const cachedTeams = this.cacheManager.getTeams(competitionId);
    // Prefer cached teams if available to avoid unnecessary API calls.
    if (cachedTeams.length > 0) {
      return cachedTeams;
    }

    // Fetch from API
    const competitionInfo = await this.sportradarClient.getCompetitionInfo(competitionId);
    if (competitionInfo && competitionInfo.season && competitionInfo.season.competitors) {
      const teams = competitionInfo.season.competitors;
      // Update cache with teams for this competition
      const currentLeagues = this.cacheManager.getLeagues();
      const currentCompetitions = this.cacheManager.getRawCompetitions();
      const currentTeams = this.cacheManager.data.teams || {};
      currentTeams[competitionId] = teams;
      this.cacheManager.save(currentLeagues, currentTeams, currentCompetitions);
      return teams;
    }
    
    return [];
  }

  /**
   * Fetch schedules for a competitor (team) and convert to internal event shape.
   * Returns an array of event objects similar to client.parseEvent's output.
   */
  async fetchCompetitorSchedules(competitorId, daysAhead = 7) {
    try {
      const schedules = await this.sportradarClient.getCompetitorSchedules(competitorId);

      const events = [];
      const seen = new Set();

  const now = Date.now();
  const limitTs = now + daysAhead * 24 * 60 * 60 * 1000;

      for (const item of schedules) {
        // normalize to sport_event object if wrapped
        const se = item.sport_event || item.sport_event || item;

        // try to get an id
        const evId = se.id || se.sport_event_id || se.sport_event?.id || JSON.stringify(se);
        if (seen.has(evId)) continue;
        seen.add(evId);

        // extract timestamp
        const dateStr = se.scheduled || se.start_time || se.start || se.sport_event?.scheduled || se.sport_event?.start;
        if (!dateStr) continue;
        const ts = Date.parse(dateStr);
  if (isNaN(ts)) continue;
  // Only include schedules between now (inclusive) and the limit timestamp
  if (ts < now) continue; // skip past events
  if (ts > limitTs) continue; // skip too-far in future

        // extract competitors
        const comps = se.competitors || se.sport_event?.competitors || se.competitors || [];
        if (!Array.isArray(comps) || comps.length < 2) continue;

        // heuristics: find home/away by qualifier or by order
        let home = comps.find(c => c.qualifier === 'home') || comps[0];
        let away = comps.find(c => c.qualifier === 'away') || comps[1];

        const homeObj = {
          id: String(home.id || home.urn || home._id || home.uid),
          team: home.name || home.common_name || home.original_name || '',
          teamAbbr: (home.name || '').substring(0,3).toUpperCase(),
          score: '',
          isWinner: false,
          isLoser: false,
        };

        const awayObj = {
          id: String(away.id || away.urn || away._id || away.uid),
          team: away.name || away.common_name || away.original_name || '',
          teamAbbr: (away.name || '').substring(0,3).toUpperCase(),
          score: '',
          isWinner: false,
          isLoser: false,
        };

        const meta = new Date(ts).toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' });

        const event = {
          home: homeObj,
          away: awayObj,
          meta: meta,
          timestamp: ts,
          link: null,
          live: false,
          isComplete: false,
        };

        events.push(event);
      }

      // sort by timestamp
      events.sort((a,b) => a.timestamp - b.timestamp);
      return events;
    } catch (e) {
      logErr(e, 'DataLoader: Error fetching schedules for competitor ' + competitorId);
      return [];
    }
  }

  async getDynamicConstants() {
    const competitions = await this.fetchCompetitions();
    
    const PREF_LEAGUES = {};
    const DISPLAY_NAME = {};
    const SPORTS = {};

    // Map competitions to our format - using Sportradar competition IDs
    const competitionMapping = {
      'sr:competition:1': 'EPL', // Premier League
      'sr:competition:17': 'Bund', // Bundesliga
      'sr:competition:23': 'LaLiga', // La Liga
      'sr:competition:34': 'Serie A', // Serie A
      'sr:competition:35': 'Ligue 1', // Ligue 1
      'sr:competition:7': 'UCL', // UEFA Champions League
      // Add more mappings as needed
    };

    for (const competition of competitions) {
      const key = competitionMapping[competition.id];
      if (key) {
        PREF_LEAGUES[key] = `${key.toLowerCase().replace(/\s+/g, '')}-enabled`;
        DISPLAY_NAME[key] = competition.name;
        
        // Fetch teams for this competition
        const teams = await this.fetchCompetitionInfo(competition.id);
        SPORTS[key] = teams.map(team => ({
          id: team.id,
          name: team.name,
          pref: `${key.toLowerCase()}-${team.name.toLowerCase().replace(/\s+/g, '')}`,
        }));
      }
    }

    // For tournaments, keep static for now
    const PREF_TOURNAMENTS = {
      "CONCACAF Gold Cup": "concacafgold-enabled",
      "Copa America": "conmebol-enabled",
      "FA Cup": "facup-enabled",
      "FIFA World Cup": "fifawc-enabled",
      "Leagues Cup": "leagues-enabled",
      "UEFA Europa Conference League": "uefaeuroconf-enabled",
      "UEFA European Championship": "uefaeuro-enabled",
      "UEFA Europa League": "uefaeuropa-enabled",
      "UEFA Women's Champions League": "uefawomenchampions-enabled",
    };

    return {
      PREF_UPDATE_FREQ: "update-frequency",
      PREF_FOLLOWED_ONLY: "followed-only",
      PREF_COMPACT_MODE: "compact-mode",
      PREF_POSITION_TOPBAR: "position-in-topbar",
      PREF_SHOW_NEXT_GAMES: "show-next-games",
      PREF_LEAGUES,
      DISPLAY_NAME,
      PREF_TOURNAMENTS,
      SPORTS,
    };
  }
}

// Export singleton instance
const DataLoader = new DataLoaderClass();
export default DataLoader;