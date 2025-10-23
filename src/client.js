import GLib from "gi://GLib";
import Soup from "gi://Soup";
import Gio from "gi://Gio";
import { logWarn, logErr } from "./logging/error_utils.js";

const STATUS = {
  TBD: "0",
  SCHEDULED: "1",
  IN_PROGRESS: "2",
  FINAL: "3",
  FORFEIT: "4",
  CANCELLED: "5",
  POSTPONED: "6",
  DELAYED: "7",
  SUSPENDED: "8",
  FORFEIT_HOME: "9",
  FORFEIT_AWAY: "10",
  RAIN_DELAY: "17",
  BEGIN_PERIOD: "21",
  END_PERIOD: "22",
  HALFTIME: "23",
  OVERTIME: "24",
  FIRST_HALF: "25",
  SECOND_HALF: "26",
  ABANDONED: "27",
  FULLTIME: "28",
  RESCHEDULED: "29",
  START_LIST: "30",
  INTERMEDIATE: "31",
  UNOFFICIAL: "32",
  MEDAL_OFFICIAL: "33",
  GROUPINGS_OFFICIAL: "34",
  PLAY_COMPELTE: "35",
  OFFICIAL_EVENT_SHORTENED: "36",
  CORRECTED_RESULT: "37",
  RETIRED: "38",
  BYE: "39",
  WALKOVER: "40",
  VOID: "41",
  PRELIMINARY: "42",
  GOLDEN_TIME: "43",
  SHOOTOUT: "44",
  FINAL_SCORE_AFTER_EXTRA_TIME: "45",
  FINAL_SCORE_AFTER_GOLDEN_GOAL: "46",
  FINAL_SCORE_AFTER_PENALTIES: "47",
  END_EXTRA_TIME: "48",
  EXTRA_TIME_HALF_TIME: "49",
  FIXTURE_NO_LIVE_COVERAGE: "50",
  FINAL_SCORE_ABANDONED: "51",
};

function loadEnv() {
  // Try to load from extension directory first
  const extensionPath = GLib.get_home_dir() + '/.local/share/gnome-shell/extensions/colosseum@sereneblue';
  let envFile = Gio.File.new_for_path(extensionPath + '/.env');
  
  // If not found, try current directory (for development)
  if (!envFile.query_exists(null)) {
    envFile = Gio.File.new_for_path('.env');
  }
  
  if (!envFile.query_exists(null)) {
    logWarn('Colosseum: No .env file found. API key will not be available.');
    return {};
  }
  
  try {
    const [success, contents] = envFile.load_contents(null);
    if (!success) {
      return {};
    }
    const text = new TextDecoder().decode(contents);
    const env = {};
    text.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        let value = valueParts.join('=').trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key.trim()] = value;
      }
    });
    return env;
  } catch (error) {
    logErr(error, 'Colosseum: Failed to load .env file');
    return {};
  }
}

const env = loadEnv();
const API_KEY = env.API_FOOTBALL_KEY;

export default class ColosseumClient {
  constructor(constants, settings) {
    this.session = new Soup.Session();
    this.dateFmt = new Intl.DateTimeFormat("en", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: "Etc/UTC",
    });

    let locale = new Intl.DateTimeFormat();
    this.timeFmt = new Intl.DateTimeFormat(
      locale.resolvedOptions().locale === "en-US" ? "en-US" : "en-GB",
      {
        hour: "numeric",
        minute: "numeric",
      },
    );

    this.BASE_API_URL = "https://v3.football.api-sports.io/";
    this.API_KEY = API_KEY;

    // Mapping from our league names to API-Sports league IDs
    this.LEAGUE_MAPPING = {
      Bund: 78, // Bundesliga
      Bund2: 79, // 2. Bundesliga
      UCL: 2, // UEFA Champions League
      "English League Championship": 40, // EFL Championship
      "English League One": 41, // EFL League One
      EPL: 39, // Premier League
      ISR: 233, // Ligat ha'Al (Israeli Premier League)
      LaLiga: 140, // La Liga
      LaLigaMX: 262, // Liga MX
      "Ligue 1": 61, // Ligue 1
      MLS: 253, // Major League Soccer
      "Serie A": 135, // Serie A
      // Tournaments
      "CONCACAF Gold Cup": 22,
      "Copa America": 9,
      "FA Cup": 45,
      "FIFA World Cup": 1,
      "Leagues Cup": 667,
      "UEFA Europa Conference League": 848,
      "UEFA European Championship": 4,
      "UEFA Europa League": 3,
      "UEFA Women's Champions League": 975,
    };

    this._CONSTANTS = constants;
    this._leagues = Object.keys(this._CONSTANTS.PREF_LEAGUES);
    this._tournaments = Object.keys(this._CONSTANTS.PREF_TOURNAMENTS);
    this._settings = settings;

    this._decoder = new TextDecoder();
  }

  getLeagueScoreboard(league, date, cacheBuster) {
    const leagueId = this.LEAGUE_MAPPING[league];
    if (!leagueId) {
      return Promise.resolve([]);
    }

    const url = `${this.BASE_API_URL}fixtures?league=${leagueId}&season=2024&date=${date}`;

    const message = Soup.Message.new("GET", url);
    message.request_headers.append("x-rapidapi-key", this.API_KEY);
    message.request_headers.append("x-rapidapi-host", "v3.football.api-sports.io");

    return new Promise((resolve, reject) => {
      this.session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (session, res) => {
          const data = session.send_and_read_finish(res);
          if (data) {
            try {
              const text = this._decoder.decode(data.toArray());
              const json = JSON.parse(text);
              resolve([json]); // Wrap in array to match current structure
            } catch (e) {
              resolve([]);
            }
          } else {
            resolve([]);
          }
        }
      );
    });
  }

  async getScores() {
    let scoreboardDate = new Date();

    // show previous day's scores until 7:00 UTC
    let utcHour = scoreboardDate.getUTCHours();
    if (utcHour < 7) {
      scoreboardDate.setUTCHours(utcHour - 8);
    }

    let events = [];

    let leagues = this.getEnabledLeagues();
    let tournaments = this.getEnabledTournaments();
    let followOnlyMode = this.isFollowOnlyEnabled();

    for (let i = 0; i < leagues.length; i++) {
      let l = {
        league: leagues[i],
        games: [],
        following: [],
      };

      let followedTeams = this.getFollowedTeams(leagues[i]);

      try {
        let data = await this.getLeagueScoreboard(
          l.league,
          this.getDate(scoreboardDate),
          scoreboardDate.getTime(),
        );

        for (let j = 0; j < data.length; j++) {
          if (data[j].response) {
            for (let k = 0; k < data[j].response.length; k++) {
              let e = this.parseEvent(data[j].response[k]);

              let isFollowedTeam = [e.home.id, e.away.id].some(
                (t) => followedTeams.indexOf(t) >= 0,
              );

              if (followOnlyMode) {
                if (isFollowedTeam) l.games.push(e);
              } else {
                l.games.push(e);
              }

              if (isFollowedTeam && e.live) {
                l.following.push(
                  `${e.home.teamAbbr}  ${e.home.score} - ${e.away.score}  ${e.away.teamAbbr} [${e.meta}]`,
                );
              }
            }
          }
        }
      } catch (error) {}

      if (l.games.length) {
        events.push(l);
      }
    }

    for (let i = 0; i < tournaments.length; i++) {
      let l = {
        league: tournaments[i],
        games: [],
        following: [],
      };

      try {
        let data = await this.getLeagueScoreboard(
          l.league,
          this.getDate(scoreboardDate),
          scoreboardDate.getTime(),
        );

        for (let j = 0; j < data.length; j++) {
          if (data[j].response) {
            for (let k = 0; k < data[j].response.length; k++) {
              let e = this.parseEvent(data[j].response[k]);
              l.games.push(e);
            }
          }
        }
      } catch (error) {}

      if (l.games.length) {
        events.push(l);
      }
    }

    return events;
  }

  async getNextGames() {
    let events = [];
    let followOnlyMode = this.isFollowOnlyEnabled();

    // Get games for the next 7 days
    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      let scoreboardDate = new Date();
      scoreboardDate.setDate(scoreboardDate.getDate() + dayOffset);

      let leagues = this.getEnabledLeagues();
      let tournaments = this.getEnabledTournaments();

      for (let i = 0; i < leagues.length; i++) {
        let l = {
          league: leagues[i],
          games: [],
          following: [],
        };

        let followedTeams = this.getFollowedTeams(leagues[i]);

        try {
          let data = await this.getLeagueScoreboard(
            l.league,
            this.getDate(scoreboardDate),
            scoreboardDate.getTime(),
          );

          for (let j = 0; j < data.length; j++) {
            if (data[j].response) {
              for (let k = 0; k < data[j].response.length; k++) {
                let e = this.parseEvent(data[j].response[k]);

                let isFollowedTeam = [e.home.id, e.away.id].some(
                  (t) => followedTeams.indexOf(t) >= 0,
                );

                if (followOnlyMode) {
                  if (isFollowedTeam) l.games.push(e);
                } else {
                  l.games.push(e);
                }
              }
            }
          }
        } catch (error) {}

        if (l.games.length) {
          // Check if we already have this league in events
          let existingLeague = events.find(event => event.league === l.league);
          if (existingLeague) {
            existingLeague.games = existingLeague.games.concat(l.games);
          } else {
            events.push(l);
          }
        }
      }

      for (let i = 0; i < tournaments.length; i++) {
        let l = {
          league: tournaments[i],
          games: [],
          following: [],
        };

        try {
          let data = await this.getLeagueScoreboard(
            l.league,
            this.getDate(scoreboardDate),
            scoreboardDate.getTime(),
          );

          for (let j = 0; j < data.length; j++) {
            if (data[j].response) {
              for (let k = 0; k < data[j].response.length; k++) {
                let e = this.parseEvent(data[j].response[k]);
                l.games.push(e);
              }
            }
          }
        } catch (error) {}

        if (l.games.length) {
          // Check if we already have this tournament in events
          let existingLeague = events.find(event => event.league === l.league);
          if (existingLeague) {
            existingLeague.games = existingLeague.games.concat(l.games);
          } else {
            events.push(l);
          }
        }
      }
    }

    return events;
  }

  getDate(date) {
    let parts = this.dateFmt.format(date).split("/");
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }

  parseEvent(fixture) {
    const event = {};

    event.live = fixture.fixture.status.elapsed > 0 && fixture.fixture.status.short !== "FT";
    event.link = null; // API doesn't provide links
    event.isComplete = fixture.fixture.status.short === "FT" || fixture.fixture.status.short === "AET" || fixture.fixture.status.short === "PEN";

    event.home = {
      id: String(fixture.teams.home.id),
      team: fixture.teams.home.name,
      teamAbbr: fixture.teams.home.name.substring(0, 3).toUpperCase(),
      score: fixture.goals.home !== null ? fixture.goals.home : "",
      isWinner: fixture.teams.home.winner,
      isLoser: fixture.teams.away.winner,
    };

    event.away = {
      id: String(fixture.teams.away.id),
      team: fixture.teams.away.name,
      teamAbbr: fixture.teams.away.name.substring(0, 3).toUpperCase(),
      score: fixture.goals.away !== null ? fixture.goals.away : "",
      isWinner: fixture.teams.away.winner,
      isLoser: fixture.teams.home.winner,
    };

    if (fixture.fixture.status.short === "NS") {
      event.home.score = "";
      event.away.score = "";
      event.meta = this.timeFmt.format(new Date(fixture.fixture.date));
    } else if (event.isComplete) {
      event.meta = "Final";
    } else if (event.live) {
      event.meta = fixture.fixture.status.long;
    } else {
      event.home.score = event.isComplete ? fixture.goals.home : "";
      event.away.score = event.isComplete ? fixture.goals.away : "";
      event.meta = fixture.fixture.status.long;
    }

    event.timestamp = new Date(fixture.fixture.date).getTime();

    return event;
  }

  getEnabledLeagues() {
    let leagues = [];

    for (let i = 0; i < this._leagues.length; i++) {
      if (
        this._settings.get_boolean(
          this._CONSTANTS.PREF_LEAGUES[this._leagues[i]],
        )
      ) {
        leagues.push(this._leagues[i]);
      }
    }

    return leagues;
  }

  getEnabledTournaments() {
    let tournaments = [];

    for (let i = 0; i < this._tournaments.length; i++) {
      if (
        this._settings.get_boolean(
          this._CONSTANTS.PREF_TOURNAMENTS[this._tournaments[i]],
        )
      ) {
        tournaments.push(this._tournaments[i]);
      }
    }

    return tournaments;
  }

  getFollowedTeams(league) {
    const followedTeams = this._settings.get_strv("followed-teams");
    const leagueTeams = this._CONSTANTS.SPORTS[league] || [];
    return leagueTeams
      .filter(team => followedTeams.includes(team.id.toString()))
      .map(team => team.id.toString());
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
        teams.push({
          id: team.id,
          name: team.name,
          league: league
        });
      }
    }

    // Sort teams by league, then by name
    teams.sort((a, b) => {
      if (a.league !== b.league) {
        return a.league.localeCompare(b.league);
      }
      return a.name.localeCompare(b.name);
    });

    return teams;
  }
}
