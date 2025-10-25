import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { getConstants, PREF_POSITION_TOPBAR } from "./const.js";
import { Colosseum } from "./widgets/colosseum.js";
import DataLoader from "./data.js";
import { logInfo, logErr } from "./logging/error_utils.js";

export default class ColosseumExtension extends Extension {
  async enable() {
    const tEnableStart = Date.now();
    logInfo('Colosseum extension: Starting enable at ' + tEnableStart);

    // Check if we should update data (only on Mondays if cache is stale)
    try {
      const tDataUpdateStart = Date.now();
      logInfo('Colosseum extension: checkForDataUpdates start at ' + tDataUpdateStart);
      await this.checkForDataUpdates();
      logInfo('Colosseum extension: Data updates checked in ' + (Date.now() - tDataUpdateStart) + ' ms');
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to check data updates');
    }

    // Load dynamic constants first
    let constants;
    try {
      const tConstantsStart = Date.now();
      logInfo('Colosseum extension: getConstants start at ' + tConstantsStart);
      constants = await getConstants();
      logInfo('Colosseum extension: Constants loaded in ' + (Date.now() - tConstantsStart) + ' ms');
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to load dynamic constants');
      constants = {}; // fallback
    }

    logInfo('Colosseum extension: Creating Colosseum widget...');
    this.scores = new Colosseum();
    logInfo('Colosseum extension: Setting settings...');
    this.scores.setSettings(
      this.getSettings("org.gnome.shell.extensions.colosseum"),
      constants,
    );
    logInfo('Colosseum extension: Calling initial update...');
    const tUpdateStart = Date.now();
    this.scores._update().then(() => {
      logInfo('Colosseum extension: Initial update completed in ' + (Date.now() - tUpdateStart) + ' ms');
    }).catch(error => {
      logErr(error, 'Colosseum extension: Failed to update scores');
    });

    logInfo('Colosseum extension: Adding to status area...');
    Main.panel.addToStatusArea(
      "colosseum",
      this.scores,
      1,
      this.scores._settings.get_int(PREF_POSITION_TOPBAR) == 0
        ? "left"
        : "right",
    );
    logInfo('Colosseum extension: Enable complete in ' + (Date.now() - tEnableStart) + ' ms');
  }

  async checkForDataUpdates() {
    logInfo('Colosseum extension: checkForDataUpdates called');
    try {
      // This will trigger cache loading and potential API calls
      logInfo('Colosseum extension: About to call DataLoader.fetchCompetitions()');
      const result = await DataLoader.fetchCompetitions();
      logInfo('Colosseum extension: DataLoader.fetchCompetitions() returned:', result);
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to check for data updates');
      logErr(error, 'Colosseum extension: Error stack');
    }
  }

  disable() {
    this.scores.destroy();
    this.scores = null;
  }
}
