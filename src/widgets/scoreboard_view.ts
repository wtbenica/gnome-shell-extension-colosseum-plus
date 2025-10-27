import Clutter from "gi://Clutter";
import St from "gi://St";
import { GameLink } from "./game_link.js";
import { getAccentColor } from "../utils/accent_color.js";
import { logErr } from "../utils/logging.js";

/**
 * Represents a team in a game
 */
export interface Team {
  id: string;
  team: string;
  teamAbbr: string;
  score: string;
  isWinner: boolean;
  isLoser: boolean;
}

/**
 * Represents a game event
 */
export interface Game {
  home: Team;
  away: Team;
  meta: string;
  timestamp?: number;
  link: string | null;
  live: boolean;
  isComplete: boolean;
}

/**
 * Client interface for fetching followed teams
 */
export interface GameClient {
  getFollowedTeams(_league: string): string[];
}

/**
 * Renders games and leagues into GNOME Shell menu layouts.
 * Only responsible for UI construction, not data fetching or transformation.
 * 
 * @param grid - The St.Widget grid to attach game elements to
 * @param games - Array of game objects to render
 * @param offset - Starting row offset in the grid
 * @param league - Optional league name to display as header
 * @param client - Optional client for fetching followed teams
 * @returns The next available row offset after adding all games
 */
export function addGamesToGrid(
  grid: any,
  games: Game[],
  offset: number = 0,
  _league: string | null = null,
  client: GameClient | null = null
): number {
  if (_league !== null) {
    grid.insert_row(offset);
    grid.insert_column(offset);
    grid.insert_column(offset);
    grid.insert_column(offset);

    const leagueName = new St.Label({
      text: _league,
      y_expand: true,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });

    grid.attach(leagueName, 0, offset, 3, 1);
    offset += 1;
  }

  const accentColor = getAccentColor();
  let followedIds: string[] = [];
  
  if (_league && client && typeof client.getFollowedTeams === "function") {
    try {
      followedIds = client.getFollowedTeams(_league) || [];
    } catch (e) {
      logErr(e, "Failed to fetch followed teams");
    }
  }

  games.forEach((game, index) => {
    const homeRow = offset + index * 3;
    const awayRow = homeRow + 1;
    const dividerRow = index === games.length - 1 ? 0 : homeRow + 2;

    const homeFollowed = followedIds.includes(String(game.home.id));
    const awayFollowed = followedIds.includes(String(game.away.id));

    const homeLabel = createTeamLabel(game.home.team, homeFollowed, accentColor);
    const homeScore = createScoreLabel(game.home.score, homeFollowed);
    const gameMeta = createMetaLabel(game.meta);

    grid.attach(homeLabel, 0, homeRow, 1, 1);
    grid.attach(homeScore, 1, homeRow, 1, 1);
    grid.attach(gameMeta, 2, homeRow, 1, 1);

    const awayLabel = createTeamLabel(game.away.team, awayFollowed, accentColor);
    const awayScore = createScoreLabel(game.away.score, awayFollowed);
    const gameLink = new GameLink(game.link);

    grid.attach(awayLabel, 0, awayRow, 1, 1);
    grid.attach(awayScore, 1, awayRow, 1, 1);
    grid.attach(gameLink, 2, awayRow, 1, 1);

    if (dividerRow) {
      const divider = new St.Label({
        text: "",
        style_class: "divider",
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      grid.attach(divider, 0, dividerRow, 3, 1);
    }
  });

  return offset + games.length * 3;
}

/**
 * Creates a styled label for a team name
 * 
 * @param teamName - The name of the team
 * @param isFollowed - Whether this team is followed by the user
 * @param accentColor - Optional accent color for followed teams
 * @returns A configured St.Label for the team
 */
function createTeamLabel(
  teamName: string,
  isFollowed: boolean,
  accentColor: string | null
): any {
  const label = new St.Label({
    text: teamName,
    style_class: `team${isFollowed ? " team--followed" : ""}`,
    y_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });

  if (isFollowed && accentColor) {
    try {
      label.set_style(`color: ${accentColor}; font-weight: 800;`);
    } catch (e) {
      logErr(e, "Failed to set style for team label");
    }
  }

  return label;
}

/**
 * Creates a styled label for a team's score
 * 
 * @param score - The score to display
 * @param isFollowed - Whether this team is followed by the user
 * @returns A configured St.Label for the score
 */
function createScoreLabel(score: string, isFollowed: boolean): any {
  return new St.Label({
    text: score,
    style_class: `score${isFollowed ? " score--followed" : ""}`,
    y_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

/**
 * Creates a label for game metadata (e.g., time, status)
 * 
 * @param meta - The metadata text to display
 * @returns A configured St.Label for the metadata
 */
function createMetaLabel(meta: string): any {
  return new St.Label({
    text: meta,
    style_class: "meta",
    y_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
}
