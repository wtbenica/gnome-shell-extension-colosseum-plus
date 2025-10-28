import type { ColosseumConstants, Settings } from '../config/types.js';
import type { Game } from '../widgets/scoreboard_view.js';
import type { Competitor } from '../api/types.js';
import DataLoader from '../data/data_loader.js';
import { logInfo, logErr } from '../utils/logging.js';
import { ErrorHandler, ErrorSeverity } from '../utils/error_handler.js';
import { TIMING } from '../config/constants.js';

export interface FilterOptions {
  followedOnly: boolean;
  followedTeams: Set<string>;
  enabledLeagues: Set<string>;
  enabledTournaments: Set<string>;
}

/**
 * Service for managing game data, filtering, and updates.
 * Encapsulates all game-related business logic.
 */
export class GameService {
  private games: Game[] = [];
  private allCompetitors: Competitor[] = [];
  private constants: ColosseumConstants | null = null;

  constructor() {}

  /**
   * Initialize the service with constants
   */
  setConstants(constants: ColosseumConstants): void {
    this.constants = constants;
  }

  /**
   * Get all games
   */
  getGames(): Game[] {
    return this.games;
  }

  /**
   * Get all competitors
   */
  getCompetitors(): Competitor[] {
    return this.allCompetitors;
  }

  /**
   * Load all competition data and populate competitors list
   */
  async loadCompetitions(): Promise<void> {
    if (!this.constants) {
      logErr(new Error('Constants not initialized'), 'GameService.loadCompetitions');
      return;
    }

    const competitions = await ErrorHandler.handleAsync(
      () => DataLoader.fetchCompetitions(),
      'GameService.loadCompetitions',
      [],
      ErrorSeverity.WARNING
    );

    if (!competitions || competitions.length === 0) {
      return;
    }

    // Fetch competitors for all competitions
    const competitorPromises = competitions.map(comp =>
      ErrorHandler.handleAsync(
        () => DataLoader.fetchCompetitionInfo(comp.id),
        `GameService.loadCompetitions.${comp.id}`,
        [],
        ErrorSeverity.WARNING
      )
    );

    const competitorArrays = await Promise.all(competitorPromises);
    this.allCompetitors = competitorArrays.flat().filter(
      (c): c is Competitor => c !== undefined
    );

    logInfo(
      `Loaded ${competitions.length} competitions with ${this.allCompetitors.length} competitors`,
      'GameService'
    );
  }

  /**
   * Refresh games for specific team IDs
   */
  async refreshGames(teamIds: string[], daysAhead: number = TIMING.DAYS_AHEAD): Promise<void> {
    const gamePromises = teamIds.map(teamId =>
      ErrorHandler.handleAsync(
        () => DataLoader.fetchCompetitorSchedules(teamId, daysAhead),
        `GameService.refreshGames.${teamId}`,
        [],
        ErrorSeverity.WARNING
      )
    );

    const gameArrays = await Promise.all(gamePromises);
    const allGames = gameArrays.flat().filter((g): g is Game => g !== undefined);

    // Deduplicate games by unique key
    const uniqueGames = new Map<string, Game>();
    for (const game of allGames) {
      const key = this.getGameKey(game);
      if (!uniqueGames.has(key) || (game.timestamp && game.timestamp < (uniqueGames.get(key)?.timestamp ?? Infinity))) {
        uniqueGames.set(key, game);
      }
    }

    this.games = Array.from(uniqueGames.values());
    this.games.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    logInfo(`Refreshed ${this.games.length} games for ${teamIds.length} teams`, 'GameService');
  }

  /**
   * Filter games based on preferences
   */
  filterGames(options: FilterOptions): Game[] {
    return this.games.filter(game => {
      // Filter by followed teams if enabled
      if (options.followedOnly) {
        const homeFollowed = options.followedTeams.has(game.home.id);
        const awayFollowed = options.followedTeams.has(game.away.id);
        if (!homeFollowed && !awayFollowed) {
          return false;
        }
      }

      // Filter by enabled leagues
      if (game.league && !options.enabledLeagues.has(game.league)) {
        return false;
      }

      // Filter by enabled tournaments
      if (game.competition && !options.enabledTournaments.has(game.competition)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get list of followed team IDs from preferences
   */
  getFollowedTeams(settings: Settings): Set<string> {
    if (!this.constants) {
      return new Set();
    }

    const followed = new Set<string>();

    for (const [_league, teams] of Object.entries(this.constants.SPORTS)) {
      for (const team of teams) {
        try {
          if (settings.get_boolean(team.pref)) {
            followed.add(team.id);
          }
        } catch {
          // Preference not found, skip
        }
      }
    }

    return followed;
  }

  /**
   * Get enabled leagues from preferences
   */
  getEnabledLeagues(settings: Settings): Set<string> {
    if (!this.constants) {
      return new Set();
    }

    const enabled = new Set<string>();

    for (const [leagueName, prefKey] of Object.entries(this.constants.PREF_LEAGUES)) {
      try {
        if (settings.get_boolean(prefKey)) {
          enabled.add(leagueName);
        }
      } catch {
        // Preference not found, skip
      }
    }

    return enabled;
  }

  /**
   * Get enabled tournaments from preferences
   */
  getEnabledTournaments(settings: Settings): Set<string> {
    if (!this.constants) {
      return new Set();
    }

    const enabled = new Set<string>();

    for (const [tournamentName, prefKey] of Object.entries(this.constants.PREF_TOURNAMENTS)) {
      try {
        if (settings.get_boolean(prefKey)) {
          enabled.add(tournamentName);
        }
      } catch {
        // Preference not found, skip
      }
    }

    return enabled;
  }

  /**
   * Generate unique key for game deduplication
   */
  private getGameKey(game: Game): string {
    return `${game.home.id}-${game.away.id}-${game.timestamp}`;
  }

  /**
   * Clear all game data
   */
  clear(): void {
    this.games = [];
    this.allCompetitors = [];
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clear();
    this.constants = null;
  }
}

export {};
