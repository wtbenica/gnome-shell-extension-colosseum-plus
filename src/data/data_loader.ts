import { CacheManager } from "./local_cache_manager.js";
import { loadEnv } from "../config/env_loader.js";
import { SportradarClient } from "../api/sportradar_api_client.js";
import { logErr } from "../utils/logging.js";
import { Game, Team } from "../widgets/scoreboard_view.js";
import type { Env } from "../config/types.js";

const env = loadEnv() as Env;
const SPORT_RADAR_KEY = env.SPORT_RADAR_KEY || "";

/**
 * Target leagues configuration
 */
interface TargetLeague {
  id: string;
  category: string;
}

/**
 * Competition information from API
 */
export interface Competition {
  id: string;
  name: string;
  category: string;
  _placeholder?: boolean;
}

/**
 * Team/competitor information
 */
export interface Competitor {
  id: string;
  name: string;
  common_name?: string;
  original_name?: string;
  qualifier?: string;
  urn?: string;
  _id?: string;
  uid?: string;
}

/**
 * Sport event from API
 */
interface SportEvent {
  id?: string;
  sport_event_id?: string;
  scheduled?: string;
  start_time?: string;
  start?: string;
  competitors?: Competitor[];
  sport_event?: {
    id?: string;
    scheduled?: string;
    start?: string;
    competitors?: Competitor[];
  };
}

/**
 * Dynamic constants for preferences
 */
export interface DynamicConstants {
  PREF_UPDATE_FREQ: string;
  PREF_FOLLOWED_ONLY: string;
  PREF_COMPACT_MODE: string;
  PREF_POSITION_TOPBAR: string;
  PREF_SHOW_NEXT_GAMES: string;
  PREF_LEAGUES: Record<string, string>;
  DISPLAY_NAME: Record<string, string>;
  PREF_TOURNAMENTS: Record<string, string>;
  SPORTS: Record<string, Array<{ id: string; name: string; pref: string }>>;
}

/**
 * Target leagues mapping
 */
const TARGET_LEAGUES: Record<string, TargetLeague> = {
  "Premier League": { id: "sr:competition:17", category: "England" },
  LaLiga: { id: "sr:competition:8", category: "Spain" },
  MLS: { id: "sr:competition:242", category: "USA" },
  "Liga MX": { id: "sr:competition:27464", category: "Mexico" },
};

/**
 * Tournament preferences mapping
 */
const PREF_TOURNAMENTS: Record<string, string> = {
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

/**
 * Manages data loading, caching, and API interactions for sports data
 */
class DataLoaderClass {
  private cacheManager: CacheManager;
  private sportradarClient: SportradarClient;

  constructor() {
    this.cacheManager = new CacheManager();
    this.sportradarClient = new SportradarClient(SPORT_RADAR_KEY);
  }

  /**
   * Fetches competitions, preferring cached data when available
   * 
   * @returns Promise resolving to array of competitions
   */
  async fetchCompetitions(): Promise<Competition[]> {
    const cachedCompetitions = this.cacheManager.getRawCompetitions();

    if (cachedCompetitions.length > 0) {
      return this._synthesizeCompetitionsFromCache(cachedCompetitions);
    }

    return await this._fetchCompetitionsFromAPI();
  }

  /**
   * Synthesizes competition list from cache with placeholders for missing entries
   * 
   * @param cachedCompetitions - Cached competitions array
   * @returns Array of competitions with placeholders
   */
  private _synthesizeCompetitionsFromCache(
    cachedCompetitions: Competition[]
  ): Competition[] {
    const cacheById = new Map(cachedCompetitions.map((c) => [c.id, c]));
    const result: Competition[] = [];

    for (const [name, details] of Object.entries(TARGET_LEAGUES)) {
      if (cacheById.has(details.id)) {
        result.push(cacheById.get(details.id)!);
      } else {
        result.push({
          id: details.id,
          name: name,
          category: details.category,
          _placeholder: true,
        });
      }
    }

    return result;
  }

  /**
   * Fetches competitions from API and updates cache
   * 
   * @returns Promise resolving to filtered competitions array
   */
  private async _fetchCompetitionsFromAPI(): Promise<Competition[]> {
    const competitions = await this.sportradarClient.getCompetitions() as Competition[];

    if (competitions.length === 0) {
      return [];
    }

    const filteredCompetitions = this._filterTargetCompetitions(competitions);
    this._updateCompetitionsCache(filteredCompetitions);

    return filteredCompetitions;
  }

  /**
   * Filters competitions to only include target leagues
   * 
   * @param competitions - All competitions from API
   * @returns Filtered array of target competitions
   */
  private _filterTargetCompetitions(
    competitions: Competition[]
  ): Competition[] {
    const targetIds = new Set(
      Object.values(TARGET_LEAGUES).map((league) => league.id)
    );
    return competitions.filter((comp) => targetIds.has(comp.id));
  }

  /**
   * Updates cache with new competitions data
   * 
   * @param competitions - Competitions to cache
   */
  private _updateCompetitionsCache(competitions: Competition[]): void {
    const currentLeagues = this.cacheManager.getLeagues();
    const currentTeams = this.cacheManager.data.teams || {};
    this.cacheManager.save(currentLeagues, currentTeams, competitions);
  }

  /**
   * Fetches detailed information about a competition, including teams
   * 
   * @param competitionId - The competition ID to fetch info for
   * @returns Promise resolving to array of teams/competitors
   */
  async fetchCompetitionInfo(competitionId: string): Promise<Competitor[]> {
    const cachedTeams = this.cacheManager.getTeams(competitionId);

    if (cachedTeams.length > 0) {
      return cachedTeams;
    }

    return await this._fetchCompetitionInfoFromAPI(competitionId);
  }

  /**
   * Fetches competition info from API and updates cache
   * 
   * @param competitionId - The competition ID
   * @returns Promise resolving to array of teams
   */
  private async _fetchCompetitionInfoFromAPI(
    competitionId: string
  ): Promise<Competitor[]> {
    const competitionInfo = await this.sportradarClient.getCompetitionInfo(competitionId) as { season?: { competitors?: Competitor[] } };

    if (
      !competitionInfo?.season?.competitors ||
      competitionInfo.season.competitors.length === 0
    ) {
      return [];
    }

    const teams = competitionInfo.season.competitors;
    this._updateTeamsCache(competitionId, teams);

    return teams;
  }

  /**
   * Updates cache with team data for a competition
   * 
   * @param competitionId - The competition ID
   * @param teams - Array of teams to cache
   */
  private _updateTeamsCache(
    competitionId: string,
    teams: Competitor[]
  ): void {
    const currentLeagues = this.cacheManager.getLeagues();
    const currentCompetitions = this.cacheManager.getRawCompetitions();
    const currentTeams = this.cacheManager.data.teams || {};

    currentTeams[competitionId] = teams;
    this.cacheManager.save(currentLeagues, currentTeams, currentCompetitions);
  }

  /**
   * Fetches schedules for a competitor and converts to game events
   * 
   * @param competitorId - The competitor/team ID
   * @param daysAhead - Number of days ahead to fetch (default: 7)
   * @returns Promise resolving to array of game events
   */
  async fetchCompetitorSchedules(
    competitorId: string,
    daysAhead: number = 7
  ): Promise<Game[]> {
    try {
      const schedules =
        (await this.sportradarClient.getCompetitorSchedules(competitorId)) as unknown[] ||
        [];
      return this._convertSchedulesToGames(schedules, daysAhead);
    } catch (e) {
      logErr(e, `Error fetching schedules for competitor ${competitorId}`);
      return [];
    }
  }

  /**
   * Converts raw schedule data to game events
   * 
   * @param schedules - Raw schedule data from API
   * @param daysAhead - Number of days ahead to include
   * @returns Array of game events
   */
  private _convertSchedulesToGames(
    schedules: unknown[],
    daysAhead: number
  ): Game[] {
    const events: Game[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    const limitTs = now + daysAhead * 24 * 60 * 60 * 1000;

    for (const item of schedules) {
      const game = this._parseScheduleItem(item, now, limitTs, seen);
      if (game) {
        events.push(game);
      }
    }

    events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return events;
  }

  /**
   * Parses a single schedule item into a game event
   * 
   * @param item - Raw schedule item
   * @param now - Current timestamp
   * @param limitTs - Maximum timestamp to include
   * @param seen - Set of seen event IDs for deduplication
   * @returns Game event or null if invalid
   */
  private _parseScheduleItem(
    item: unknown,
    now: number,
    limitTs: number,
    seen: Set<string>
  ): Game | null {
    const se = this._normalizeSportEvent(item);
    const evId = this._getEventId(se);

    if (seen.has(evId)) {
      return null;
    }
    seen.add(evId);

    const ts = this._parseEventTimestamp(se);
    if (!ts || ts < now || ts > limitTs) {
      return null;
    }

    const comps = this._getCompetitors(se);
    if (comps.length < 2) {
      return null;
    }

    const home = comps.find((c) => c.qualifier === "home") || comps[0];
    const away = comps.find((c) => c.qualifier === "away") || comps[1];

    const homeTeam = this._makeTeamObj(home);
    const awayTeam = this._makeTeamObj(away);

    // Set league from raw data if available
    homeTeam.league = (item as { home?: { league?: string } }).home?.league;
    awayTeam.league = (item as { away?: { league?: string } }).away?.league;

    return {
      home: homeTeam,
      away: awayTeam,
      meta: new Date(ts).toLocaleString(undefined, {
        hour: "numeric",
        minute: "numeric",
      }),
      timestamp: ts,
      link: null,
      live: false,
      isComplete: false,
      league: (item as { league?: string }).league,
      competition: (item as { competition?: string }).competition,
    };
  }

  /**
   * Normalizes different sport event wrapper formats
   * 
   * @param item - Raw event item
   * @returns Normalized sport event
   */
  private _normalizeSportEvent(item: unknown): SportEvent {
    const obj = item as { sport_event?: SportEvent };
    return (obj && (obj.sport_event || obj)) || obj;
  }

  /**
   * Derives a unique event ID for deduplication
   * 
   * @param se - Sport event
   * @returns Unique event ID string
   */
  private _getEventId(se: SportEvent): string {
    return (
      se.id ||
      se.sport_event_id ||
      se.sport_event?.id ||
      JSON.stringify(se)
    );
  }

  /**
   * Parses timestamp from various possible fields
   * 
   * @param se - Sport event
   * @returns Timestamp in milliseconds or null if invalid
   */
  private _parseEventTimestamp(se: SportEvent): number | null {
    const dateStr =
      se.scheduled ||
      se.start_time ||
      se.start ||
      se.sport_event?.scheduled ||
      se.sport_event?.start;

    if (!dateStr) {
      return null;
    }

    const ts = Date.parse(dateStr);
    return Number.isNaN(ts) ? null : ts;
  }

  /**
   * Gets competitors array in normalized form
   * 
   * @param se - Sport event
   * @returns Array of competitors
   */
  private _getCompetitors(se: SportEvent): Competitor[] {
    const comps =
      se.competitors || se.sport_event?.competitors || [];
    return Array.isArray(comps) ? comps : [];
  }

  /**
   * Constructs a normalized team object
   * 
   * @param comp - Competitor data
   * @returns Normalized team object
   */
  private _makeTeamObj(comp: Competitor): Team {
    const id = String(
      comp.id || comp.urn || comp._id || comp.uid || ""
    );
    const name =
      comp.name || comp.common_name || comp.original_name || "";

    return {
      id,
      team: name,
      teamAbbr: (name || "").substring(0, 3).toUpperCase(),
      score: "",
      isWinner: false,
      isLoser: false,
    };
  }

  /**
   * Generates dynamic constants for preferences based on available competitions
   * 
   * @returns Promise resolving to dynamic constants object
   */
  async getDynamicConstants(): Promise<DynamicConstants> {
    const competitions = await this.fetchCompetitions();

    const PREF_LEAGUES: Record<string, string> = {};
    const DISPLAY_NAME: Record<string, string> = {};
    const SPORTS: Record<
      string,
      Array<{ id: string; name: string; pref: string }>
    > = {};

    const competitionMapping: Record<string, string> = {
      "sr:competition:1": "EPL",
      "sr:competition:17": "Bund",
      "sr:competition:23": "LaLiga",
      "sr:competition:34": "Serie A",
      "sr:competition:35": "Ligue 1",
      "sr:competition:7": "UCL",
    };

    const relevant = competitions
      .map((c) => ({ c, mapped: competitionMapping[c.id] }))
      .filter((it) => it.mapped);

    const teamResults = await this._fetchTeamsForCompetitions(relevant);

    for (const res of teamResults) {
      PREF_LEAGUES[res.mapped] = `${res.mapped
        .toLowerCase()
        .replace(/\s+/g, "")}-enabled`;
      DISPLAY_NAME[res.mapped] = res.name;
      SPORTS[res.mapped] = (res.teams || []).map((team) => ({
        id: team.id,
        name: team.name,
        pref: `${res.mapped.toLowerCase()}-${team.name
          .toLowerCase()
          .replace(/\s+/g, "")}`,
      }));
    }

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

  /**
   * Fetches teams for multiple competitions in parallel
   * 
   * @param relevant - Array of competition data with mappings
   * @returns Promise resolving to array of competition results with teams
   */
  private async _fetchTeamsForCompetitions(
    relevant: Array<{ c: Competition; mapped: string }>
  ): Promise<Array<{ mapped: string; name: string; teams: Competitor[] }>> {
    const teamFetchPromises = relevant.map(async ({ c, mapped }) => {
      const teams = await this.fetchCompetitionInfo(c.id);
      return { mapped, name: c.name, teams };
    });

    return await Promise.all(teamFetchPromises);
  }
}

/**
 * Singleton instance of DataLoader
 */
const DataLoader = new DataLoaderClass();
export default DataLoader;
