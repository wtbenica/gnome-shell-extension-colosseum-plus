import GLib from "gi://GLib";
import Soup from "gi://Soup";
import Gio from "gi://Gio";

import { CacheManager } from "./cache_manager.js";
import { loadEnv } from "./env_loader.js";
import { SportradarClient } from "./sportradar_client.js";
import { logInfo, logErr } from "./logging/error_utils.js";

const env = loadEnv();
const SPORT_RADAR_KEY = env.SPORT_RADAR_KEY;

class DataLoaderClass {
  constructor() {
    logInfo('DataLoader: Constructor called');
    this.cacheManager = new CacheManager();
    this.sportradarClient = new SportradarClient(SPORT_RADAR_KEY);
    logInfo('DataLoader: Constructor complete');
  }

  async fetchCompetitions() {
    logInfo('DataLoader: Fetching competitions');
    
    // Check cache first
    const cachedCompetitions = this.cacheManager.getRawCompetitions();
    if (cachedCompetitions.length > 0 && !this.cacheManager.shouldUpdate()) {
      logInfo('DataLoader: Returning cached competitions:', cachedCompetitions.length);
      return cachedCompetitions;
    }

    // Fetch from API
    const competitions = await this.sportradarClient.getCompetitions();
    if (competitions.length > 0) {
      // Log all competition names for debugging
      logInfo('DataLoader: All competitions:', competitions.map(c => `${c.name} (${c.category?.name}) - ID: ${c.id}${c.parent_id ? ` - Parent: ${c.parent_id}` : ''}`));
            // Filter to only the 4 target leagues
      // Hard-coded target leagues with their competition IDs (using parent competitions where applicable)
      const targetLeagues = {
        'Premier League': { id: 'sr:competition:17', category: 'England' },
        'LaLiga': { id: 'sr:competition:8', category: 'Spain' },
        'MLS': { id: 'sr:competition:242', category: 'USA' },
        'Liga MX': { id: 'sr:competition:27464', category: 'Mexico' } // Using Apertura child competition
      };
      const filteredCompetitions = competitions.filter(comp => {
        for (const [name, details] of Object.entries(targetLeagues)) {
          if (comp.id === details.id && comp.category?.name === details.category) {
            return true;
          }
        }
        return false;
      });
      logInfo('DataLoader: Filtered competitions:', filteredCompetitions.map(c => `${c.name} (${c.category?.name}) - ID: ${c.id}${c.parent_id ? ` - Parent: ${c.parent_id}` : ''}`));
      // Update cache with competitions and empty teams for now
      this.cacheManager.save([], filteredCompetitions, []);
      logInfo('DataLoader: Fetched and cached competitions:', filteredCompetitions.length);
      return filteredCompetitions;
    }
    return [];
  }

  async fetchCompetitionInfo(competitionId) {
    logInfo('DataLoader: Fetching competition info for', competitionId);
    
    // Check cache first
    const cachedTeams = this.cacheManager.getTeams(competitionId);
    if (cachedTeams.length > 0 && !this.cacheManager.shouldUpdate()) {
      logInfo('DataLoader: Returning cached teams for', competitionId, ':', cachedTeams.length);
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
      logInfo('DataLoader: Fetched and cached teams for', competitionId, ':', teams.length);
      return teams;
    }
    
    logInfo('DataLoader: Failed to fetch competition info for', competitionId);
    return [];
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