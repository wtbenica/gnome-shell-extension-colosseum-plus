import GLib from "gi://GLib";
import Soup from "gi://Soup";
import Gio from "gi://Gio";

import { CacheManager } from "./cache_manager.js";
import { loadEnv } from "./env_loader.js";
import { SportradarClient } from "./sportradar_client.js";
import { gjsLogger } from "./logger_gjs.js";

const env = loadEnv();
const SPORT_RADAR_KEY = env.SPORT_RADAR_KEY;

class DataLoaderClass {
  constructor() {
    gjsLogger.log('DataLoader: Constructor called');
    this.cacheManager = new CacheManager();
    this.sportradarClient = new SportradarClient(SPORT_RADAR_KEY);
    gjsLogger.log('DataLoader: Constructor complete');
  }

  async fetchCompetitions() {
    gjsLogger.log('DataLoader: Fetching competitions');
    
    // Check cache first
    const cachedCompetitions = this.cacheManager.getRawCompetitions();
    if (cachedCompetitions.length > 0 && !this.cacheManager.shouldUpdate()) {
      gjsLogger.log('DataLoader: Returning cached competitions:', cachedCompetitions.length);
      return cachedCompetitions;
    }

    // Fetch from API
    const competitions = await this.sportradarClient.getCompetitions();
    if (competitions.length > 0) {
      // Update cache with competitions and empty teams for now
      this.cacheManager.save([], competitions, []);
      gjsLogger.log('DataLoader: Fetched and cached competitions:', competitions.length);
    }
    return competitions;
  }

  async fetchCompetitionInfo(competitionId) {
    gjsLogger.log('DataLoader: Fetching competition info for', competitionId);
    
    // Check cache first
    const cachedTeams = this.cacheManager.getTeams(competitionId);
    if (cachedTeams.length > 0 && !this.cacheManager.shouldUpdate()) {
      gjsLogger.log('DataLoader: Returning cached teams for', competitionId, ':', cachedTeams.length);
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
      gjsLogger.log('DataLoader: Fetched and cached teams for', competitionId, ':', teams.length);
      return teams;
    }
    
    gjsLogger.log('DataLoader: Failed to fetch competition info for', competitionId);
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