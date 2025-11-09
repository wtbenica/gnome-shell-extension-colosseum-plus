import { FirebaseBackendClient } from "../api/firebase_backend_client.js";
import type { Country } from "../api/firebase_backend_client.js";
import { TIMING } from "../config/constants.js";
import { logErr } from "../utils/logging.js";
import { Game, Team } from "../widgets/scoreboard_view.js";

import type { Competition, Competitor, SportEventBasic } from "../api/types.js";
import type { ArenaConstants } from "../config/types.js";

/**
 * Normalizes competitor ID from various possible field names
 */
function normalizeCompetitorId(competitor: Competitor): string {
  return String(competitor.id || competitor._id || competitor.uid || competitor.urn || '');
}

/**
 * Sport event from API - extends SportEventBasic with additional wrapper possibilities
 */
type SportEvent = SportEventBasic | { sport_event?: SportEventBasic };

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
  private backendClient: FirebaseBackendClient;

  constructor() {
    // Use emulator during development, switch to production URL later
    this.backendClient = new FirebaseBackendClient('http://127.0.0.1:5001/demo-arena/us-central1');
  }

  /**
   * Fetches available countries
   * 
   * @returns Promise resolving to array of countries
   */
  async fetchCountries(): Promise<Country[]> {
    try {
      return await this.backendClient.getCountries();
    } catch (e) {
      logErr(e, 'Error fetching countries');
      return [];
    }
  }

  /**
   * Fetches competitions, optionally filtered by country
   * 
   * @param countryCode - Optional country code to filter by
   * @returns Promise resolving to array of competitions
   */
  async fetchCompetitions(countryCode?: string): Promise<Competition[]> {
    try {
      if (countryCode) {
        return await this.backendClient.getCompetitionsForCountry(countryCode);
      }
      return await this.backendClient.getCompetitions();
    } catch (e) {
      logErr(e, `Error fetching competitions${countryCode ? ` for ${countryCode}` : ''}`);
      return [];
    }
  }

  /**
   * Fetches detailed information about a competition, including teams
   * 
   * @param competitionId - The competition ID to fetch info for
   * @returns Promise resolving to array of teams/competitors
   */
  async fetchCompetitionInfo(competitionId: string): Promise<Competitor[]> {
    try {
      // Get seasons for the competition
      const seasons = await this.backendClient.getSeasons(competitionId);
      if (!seasons || seasons.length === 0) {
        return [];
      }

      // Use the most recent season (last in the array)
      const season = seasons[seasons.length - 1];
      
      // Get competitors for that season
      const competitors = await this.backendClient.getCompetitors(competitionId, season.id);
      return competitors.map((c) => ({ ...c, id: normalizeCompetitorId(c) }));
    } catch (e) {
      logErr(e, `Error fetching competition info for ${competitionId}`);
      return [];
    }
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
    daysAhead: number = TIMING.DAYS_AHEAD
  ): Promise<Game[]> {
    try {
      const schedules = await this.backendClient.getSchedules(competitorId);
      return this._convertSchedulesToGames(schedules, daysAhead);
    } catch (e) {
      logErr(e, `Error fetching schedules for competitor ${competitorId}`);
      return [];
    }
  }

  /**
   * Fetches live score for a specific event
   * 
   * @param eventId - The sport event ID
   * @returns Promise resolving to live score data or null
   */
  async fetchLiveScore(eventId: string): Promise<{ homeScore?: number; awayScore?: number; status?: string } | null> {
    try {
      return await this.backendClient.getLiveScore(eventId);
    } catch (e) {
      logErr(e, `Error fetching live score for event ${eventId}`);
      return null;
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
    schedules: SportEvent[],
    daysAhead: number
  ): Game[] {
    const events: Game[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    const limitTs = now + daysAhead * 24 * 60 * 60 * 1000;
    
    // Calculate start of today (midnight in local timezone)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.getTime();
    
    // Include games from start of today onwards
    const minTs = startOfToday;

    for (const item of schedules) {
      const game = this._parseScheduleItem(item, minTs, limitTs, seen, now);
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
   * @param minTs - Minimum timestamp to include (start of today)
   * @param limitTs - Maximum timestamp to include
   * @param seen - Set of seen event IDs for deduplication
   * @param now - Current timestamp for determining live status
   * @returns Game event or null if invalid
   */
  private _parseScheduleItem(
    item: SportEvent,
    minTs: number,
    limitTs: number,
    seen: Set<string>,
    now: number
  ): Game | null {
    const se = this._normalizeSportEvent(item);
    const evId = this._getEventId(se);

    if (seen.has(evId)) {
      return null;
    }
    seen.add(evId);

    const ts = this._parseEventTimestamp(se);
    if (!ts || ts < minTs || ts > limitTs) {
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

    // Determine if game is live or complete
    // Typical soccer game is ~2 hours, allow up to 3 hours for extra time
    const gameEndEstimate = ts + (3 * 60 * 60 * 1000); // 3 hours after start
    const isLive = ts <= now && now < gameEndEstimate;
    const isComplete = now >= gameEndEstimate;

    return {
      home: homeTeam,
      away: awayTeam,
      meta: new Date(ts).toLocaleString(undefined, {
        hour: "numeric",
        minute: "numeric",
      }),
      timestamp: ts,
      link: null,
      live: isLive,
      isComplete: isComplete,
      league: (item as { league?: string }).league,
      competition: (item as { competition?: string }).competition,
      eventId: evId,
    };
  }

  /**
   * Normalizes different sport event wrapper formats
   * 
   * @param item - Raw event item
   * @returns Normalized sport event basic structure
   */
  private _normalizeSportEvent(item: SportEvent): SportEventBasic {
    // If item has a sport_event wrapper, unwrap it
    if ('sport_event' in item && item.sport_event && typeof item.sport_event === 'object') {
      const wrapped = item.sport_event as SportEventBasic;
      return {
        id: wrapped.id,
        sport_event_id: wrapped.sport_event_id,
        scheduled: wrapped.scheduled,
        start_time: wrapped.start_time,
        start: wrapped.start,
        competitors: wrapped.competitors,
        sport_event: null
      };
    }
    // Otherwise it's already a SportEventBasic
    return item as SportEventBasic;
  }

  /**
   * Derives a unique event ID for deduplication
   * 
   * @param se - Sport event
   * @returns Unique event ID string
   */
  private _getEventId(se: SportEventBasic): string {
    const sportEvent = se.sport_event as SportEventBasic | null | undefined;
    return (
      se.id ||
      se.sport_event_id ||
      sportEvent?.id ||
      JSON.stringify(se)
    );
  }

  /**
   * Parses timestamp from various possible fields
   * 
   * @param se - Sport event
   * @returns Timestamp in milliseconds or null if invalid
   */
  private _parseEventTimestamp(se: SportEventBasic): number | null {
    const sportEvent = se.sport_event as SportEventBasic | null | undefined;
    const dateStr =
      se.scheduled ||
      se.start_time ||
      se.start ||
      sportEvent?.scheduled ||
      sportEvent?.start;

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
  private _getCompetitors(se: SportEventBasic): Competitor[] {
    const sportEvent = se.sport_event as SportEventBasic | null | undefined;
    const comps =
      se.competitors || sportEvent?.competitors || [];
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
   * @returns Promise resolving to Arena constants configuration
   */
  async getDynamicConstants(): Promise<ArenaConstants> {
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
      SPORTS[res.mapped] = (res.teams || []).map((team) => {
        const name = team.name || 'Unknown';
        const id = normalizeCompetitorId(team);
        return {
          id,
          name,
          pref: `${res.mapped.toLowerCase()}-${name
            .toLowerCase()
            .replace(/\s+/g, "")}`,
        };
      });
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
