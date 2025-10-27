// TypeScript version of ColosseumClient
import DataLoader from "../data/data.js";
export default class ColosseumClient {
    constructor(constants, settings) {
        this._CONSTANTS = constants;
        this._settings = settings;
        this._leagues = Object.keys(this._CONSTANTS.PREF_LEAGUES || {});
        this._tournaments = Object.keys(this._CONSTANTS.PREF_TOURNAMENTS || {});
    }
    async getScores() {
        return [];
    }
    async getNextGames() {
        return [];
    }
    getEnabledLeagues() {
        const leagues = [];
        for (let i = 0; i < this._leagues.length; i++) {
            if (this._settings.get_boolean(this._CONSTANTS.PREF_LEAGUES[this._leagues[i]])) {
                leagues.push(this._leagues[i]);
            }
        }
        return leagues;
    }
    getEnabledTournaments() {
        const tournaments = [];
        for (let i = 0; i < this._tournaments.length; i++) {
            if (this._settings.get_boolean(this._CONSTANTS.PREF_TOURNAMENTS[this._tournaments[i]])) {
                tournaments.push(this._tournaments[i]);
            }
        }
        return tournaments;
    }
    getFollowedTeams(league) {
        const followedTeams = this._settings.get_strv('followed-teams') || [];
        const leagueTeams = this._CONSTANTS.SPORTS[league] || [];
        return leagueTeams
            .filter(team => followedTeams.includes(String(team.id)))
            .map(team => String(team.id));
    }
    /**
     * Fetches the schedule for a given team using DataLoader.
     * @param teamId
     * @returns Promise<Array<any>>
     */
    async getTeamSchedule(teamId) {
        return await DataLoader.fetchCompetitorSchedules(teamId, 7);
    }
    isFollowOnlyEnabled() {
        return this._settings.get_boolean(this._CONSTANTS.PREF_FOLLOWED_ONLY);
    }
    isShowNextGamesEnabled() {
        return this._settings.get_boolean(this._CONSTANTS.PREF_SHOW_NEXT_GAMES);
    }
    async getAvailableTeams() {
        const enabledLeagues = this.getEnabledLeagues();
        const teams = [];
        for (const league of enabledLeagues) {
            const leagueTeams = this._CONSTANTS.SPORTS[league] || [];
            for (const team of leagueTeams) {
                teams.push({ id: team.id, name: team.name, league: league });
            }
        }
        teams.sort((a, b) => {
            if (a.league !== b.league)
                return a.league.localeCompare(b.league);
            return a.name.localeCompare(b.name);
        });
        return teams;
    }
}
