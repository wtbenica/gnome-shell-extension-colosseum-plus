// TypeScript version of ColosseumClient

export interface ColosseumConstants {
  PREF_LEAGUES: Record<string, string>;
  PREF_TOURNAMENTS: Record<string, string>;
  SPORTS: Record<string, Array<{ id: number; name: string; league?: string }>>;
  PREF_FOLLOWED_ONLY: string;
  PREF_SHOW_NEXT_GAMES: string;
}

export interface Settings {
  get_boolean(key: string): boolean;
  get_strv(key: string): string[];
  get_int?(key: string): number;
}

export default class ColosseumClient {
  private _CONSTANTS: ColosseumConstants;
  private _settings: Settings;
  private _leagues: string[];
  private _tournaments: string[];

  constructor(constants: ColosseumConstants, settings: Settings) {
    this._CONSTANTS = constants;
    this._settings = settings;
    this._leagues = Object.keys(this._CONSTANTS.PREF_LEAGUES || {});
    this._tournaments = Object.keys(this._CONSTANTS.PREF_TOURNAMENTS || {});
  }

  async getScores(): Promise<any[]> {
    return [];
  }

  async getNextGames(): Promise<any[]> {
    return [];
  }

  getEnabledLeagues(): string[] {
    const leagues: string[] = [];
    for (let i = 0; i < this._leagues.length; i++) {
      if (this._settings.get_boolean(this._CONSTANTS.PREF_LEAGUES[this._leagues[i]])) {
        leagues.push(this._leagues[i]);
      }
    }
    return leagues;
  }

  getEnabledTournaments(): string[] {
    const tournaments: string[] = [];
    for (let i = 0; i < this._tournaments.length; i++) {
      if (this._settings.get_boolean(this._CONSTANTS.PREF_TOURNAMENTS[this._tournaments[i]])) {
        tournaments.push(this._tournaments[i]);
      }
    }
    return tournaments;
  }

  getFollowedTeams(league: string): string[] {
    const followedTeams = this._settings.get_strv('followed-teams') || [];
    const leagueTeams = this._CONSTANTS.SPORTS[league] || [];
    return leagueTeams
      .filter(team => followedTeams.includes(String(team.id)))
      .map(team => String(team.id));
  }

  isFollowOnlyEnabled(): boolean {
    return this._settings.get_boolean(this._CONSTANTS.PREF_FOLLOWED_ONLY);
  }

  isShowNextGamesEnabled(): boolean {
    return this._settings.get_boolean(this._CONSTANTS.PREF_SHOW_NEXT_GAMES);
  }

  async getAvailableTeams(): Promise<Array<{ id: number; name: string; league: string }>> {
    const enabledLeagues = this.getEnabledLeagues();
    const teams: Array<{ id: number; name: string; league: string }> = [];

    for (const league of enabledLeagues) {
      const leagueTeams = this._CONSTANTS.SPORTS[league] || [];
      for (const team of leagueTeams) {
        teams.push({ id: team.id, name: team.name, league: league });
      }
    }

    teams.sort((a, b) => {
      if (a.league !== b.league) return a.league.localeCompare(b.league);
      return a.name.localeCompare(b.name);
    });

    return teams;
  }
}
