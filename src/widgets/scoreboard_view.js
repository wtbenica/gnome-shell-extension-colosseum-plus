import Clutter from "gi://Clutter";
import St from "gi://St";
import { GameLink } from "./game_link.js";
import { getAccentColor } from '../utils/accent_color.js';
import { logErr } from "../utils/logging.js";

/**
 * ScoreboardView: Renders games and leagues into GNOME Shell menu layouts.
 * Only responsible for UI construction, not data fetching or transformation.
 */
export function addGamesToGrid(grid, games, offset = 0, league = null, client = null) {
  if (league !== null) {
    grid.insert_row(offset);
    grid.insert_column(offset);
    grid.insert_column(offset);
    grid.insert_column(offset);

    const leagueName = new St.Label({
      text: league,
      y_expand: true,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });

    grid.attach(leagueName, 0, offset, 3, 1);
    offset += 1;
  }

  const accentColor = getAccentColor();
  let followedIds = [];
  if (league && client && typeof client.getFollowedTeams === "function") {
    try {
      followedIds = client.getFollowedTeams(league) || [];
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

function createTeamLabel(teamName, isFollowed, accentColor) {
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

function createScoreLabel(score, isFollowed) {
  return new St.Label({
    text: score,
    style_class: `score${isFollowed ? " score--followed" : ""}`,
    y_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

function createMetaLabel(meta) {
  return new St.Label({
    text: meta,
    style_class: "meta",
    y_expand: true,
    y_align: Clutter.ActorAlign.CENTER,
  });
}
