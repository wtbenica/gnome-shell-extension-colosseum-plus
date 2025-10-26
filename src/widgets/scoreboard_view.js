import { getAccentColor } from './accent_utils.js';

/**
 * ScoreboardView: Renders games and leagues into GNOME Shell menu layouts.
 * Only responsible for UI construction, not data fetching or transformation.
 */
export function addGamesToGrid(grid, games, offset = 0, league = null, client = null) {
  if (league != null) {
    grid.insert_row(offset);
    grid.insert_column(offset);
    grid.insert_column(offset);
    grid.insert_column(offset);

    let leagueName = new St.Label({
      text: league,
      y_expand: true,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });

    grid.attach(leagueName, 0, offset, 3, 1);
    offset = offset + 1;
  }

  const accentColor = getAccentColor();
  let followedIds = [];
  try {
    if (league && client && typeof client.getFollowedTeams === 'function') {
      followedIds = client.getFollowedTeams(league) || [];
    }
  } catch (e) {
    followedIds = [];
  }

  let pos;
  for (let j = 0; j < games.length * 3 - 1; j++) {
    pos = j + offset;
    grid.insert_row(pos);
    grid.insert_column(pos);
    grid.insert_column(pos);
    grid.insert_column(pos);
  }

  for (let j = 0; j < games.length; j++) {
    let homeRow = offset + j * 3;
    let awayRow = homeRow + 1;
    let divider_row =
      games.length == 1 ? 0 : j == games.length - 1 ? 0 : homeRow + 2;

    let homeSuffix = games[j].home.isWinner
      ? "--winner"
      : games[j].home.isLoser
        ? "--loser"
        : "";
    let awaySuffix = games[j].away.isWinner
      ? "--winner"
      : games[j].away.isLoser
        ? "--loser"
        : "";

    const homeFollowed = followedIds.indexOf(String(games[j].home.id)) >= 0;

    let homeLabel = new St.Label({
      text: games[j].home.team,
      style_class: "team" + homeSuffix + (homeFollowed ? " team--followed" : ""),
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    if (homeFollowed) {
      try { homeLabel.add_style_class_name('team--followed'); } catch (e) { }
      try { if (accentColor) homeLabel.set_style(`color: ${accentColor}; font-weight: 800;`); } catch (e) { }
    }

    let homeScore = new St.Label({
      text: games[j].home.score,
      style_class: "score" + homeSuffix,
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    let gameMeta = new St.Label({
      text: games[j].meta,
      style_class: "meta",
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    grid.attach(homeLabel, 0, homeRow, 1, 1);
    grid.attach(homeScore, 1, homeRow, 1, 1);
    grid.attach(gameMeta, 2, homeRow, 1, 1);

    const awayFollowed = followedIds.indexOf(String(games[j].away.id)) >= 0;

    let awayLabel = new St.Label({
      text: games[j].away.team,
      style_class: "team" + awaySuffix + (awayFollowed ? " team--followed" : ""),
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    if (awayFollowed) {
      try { awayLabel.add_style_class_name('team--followed'); } catch (e) { }
      try { if (accentColor) awayLabel.set_style(`color: ${accentColor}; font-weight: 800;`); } catch (e) { }
    }

    let awayScore = new St.Label({
      text: games[j].away.score,
      style_class: "score" + awaySuffix,
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    let gameLink = new GameLink(games[j].link);

    grid.attach(awayLabel, 0, awayRow, 1, 1);
    grid.attach(awayScore, 1, awayRow, 1, 1);
    grid.attach(gameLink, 2, awayRow, 1, 1);

    let div = new St.Label({
      text: "",
      style_class: "divider",
      y_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    if (divider_row) {
      grid.attach(div, 0, divider_row, 3, 1);
    }
  }

  if (league != null) {
    grid.insert_row(pos + 1);
    grid.insert_column(pos + 1);

    grid.attach(
      new St.Label({
        text: "",
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      }),
      0,
      pos + 1,
      1,
      1,
    );
  }

  return pos + 2;
}
