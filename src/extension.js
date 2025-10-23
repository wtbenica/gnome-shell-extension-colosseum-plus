import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { getConstants, PREF_POSITION_TOPBAR } from "./const.js";
import { Colosseum } from "./widgets/colosseum.js";
import DataLoader from "./data.js";
import { logInfo, logErr } from "./logging/error_utils.js";

export default class ColosseumExtension extends Extension {
  async enable() {
    logInfo('Colosseum extension: Starting enable...');
    
    // Check if we should update data (only on Mondays if cache is stale)
    try {
      await this.checkForDataUpdates();
      logInfo('Colosseum extension: Data updates checked');
    } catch (error) {
      logErr(error, 'Colosseum extension: Failed to check data updates');
    }

    // Load dynamic constants first
    let constants;
    try {
      constants = await getConstants();
      logInfo('Colosseum extension: Constants loaded');
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
    this.scores._update().catch(error => {
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
    logInfo('Colosseum extension: Enable complete!');
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
