import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { getConstants, PREF_POSITION_TOPBAR } from "./const.js";
import { Colosseum } from "./widgets/colosseum.js";
import DataLoader from "./data.js";

export default class ColosseumExtension extends Extension {
  async enable() {
    console.log('Colosseum extension: Starting enable...');
    
    // Check if we should update data (only on Mondays if cache is stale)
    try {
      await this.checkForDataUpdates();
      console.log('Colosseum extension: Data updates checked');
    } catch (error) {
      console.error('Colosseum extension: Failed to check data updates:', error);
    }

    // Load dynamic constants first
    try {
      await getConstants();
      console.log('Colosseum extension: Constants loaded');
    } catch (error) {
      console.error('Colosseum extension: Failed to load dynamic constants:', error);
      // Continue with static constants as fallback
    }

    console.log('Colosseum extension: Creating Colosseum widget...');
    this.scores = new Colosseum();
    console.log('Colosseum extension: Setting settings...');
    this.scores.setSettings(
      this.getSettings("org.gnome.shell.extensions.colosseum"),
    );
    console.log('Colosseum extension: Calling initial update...');
    this.scores._update().catch(error => {
      console.error('Colosseum extension: Failed to update scores:', error);
    });

    console.log('Colosseum extension: Adding to status area...');
    Main.panel.addToStatusArea(
      "colosseum",
      this.scores,
      1,
      this.scores._settings.get_int(PREF_POSITION_TOPBAR) == 0
        ? "left"
        : "right",
    );
    console.log('Colosseum extension: Enable complete!');
  }

  async checkForDataUpdates() {
    console.log('Colosseum extension: checkForDataUpdates called');
    try {
      // This will trigger cache loading and potential API calls
      console.log('Colosseum extension: About to call DataLoader.fetchLeagues()');
      const result = await DataLoader.fetchLeagues();
      console.log('Colosseum extension: DataLoader.fetchLeagues() returned:', result);
    } catch (error) {
      console.error('Colosseum extension: Failed to check for data updates:', error);
      console.error('Colosseum extension: Error stack:', error.stack);
    }
  }

  disable() {
    this.scores.destroy();
    this.scores = null;
  }
}
