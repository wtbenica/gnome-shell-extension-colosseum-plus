import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import St from "gi://St";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";
import * as CheckBox from "resource:///org/gnome/shell/ui/checkBox.js";

export const TeamSelectorDialog = GObject.registerClass(
  class TeamSelectorDialog extends ModalDialog.ModalDialog {
    _init(settings, constants) {
      super._init({ styleClass: 'team-selector-dialog' });

      this._settings = settings;
      this._constants = constants;

      this.setButtons([
        {
          label: 'Cancel',
          action: this._onCancel.bind(this),
          key: Clutter.KEY_Escape,
        },
        {
          label: 'Save',
          action: this._onSave.bind(this),
          default: true,
        },
      ]);

      let headline = new St.Label({
        text: 'Select Teams to Follow',
        style_class: 'headline',
      });

      this.contentLayout.add_child(headline);

      // Create scrollable content
      let scrollView = new St.ScrollView({
        style_class: 'team-selector-scroll-view',
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
      });

      this._contentBox = new St.BoxLayout({
        vertical: true,
        style_class: 'team-selector-content',
      });

      scrollView.add_child(this._contentBox);
      this.contentLayout.add_child(scrollView);

      this._teamCheckboxes = new Map();
      this._populateTeams();
    }

    _populateTeams() {
      const followedTeams = this._settings.get_strv('followed-teams');
      const sports = this._constants.SPORTS || {};
      const displayNames = this._constants.DISPLAY_NAME || {};

      this._teamCheckboxes = new Map();
      this._leagues = Object.keys(sports);
      this._currentLeagueIndex = 0;
      this._followedTeams = followedTeams;
      this._sports = sports;
      this._displayNames = displayNames;

      // Start populating in batches to avoid blocking the UI
      this._populateNextBatch();
    }

    _populateNextBatch() {
      const batchSize = 10; // Process 10 teams at a time
      let teamsProcessed = 0;

      while (this._currentLeagueIndex < this._leagues.length && teamsProcessed < batchSize) {
        const league = this._leagues[this._currentLeagueIndex];
        const teams = this._sports[league] || [];

        // Add league header if not already added
        if (!this._leagueHeadersAdded) {
          this._leagueHeadersAdded = new Set();
        }
        if (!this._leagueHeadersAdded.has(league)) {
          let leagueHeader = new St.Label({
            text: this._displayNames[league] || league,
            style_class: 'team-selector-league-header',
          });
          this._contentBox.add_child(leagueHeader);
          this._leagueHeadersAdded.add(league);
        }

        // Add teams for this league
        while (this._currentTeamIndex < teams.length && teamsProcessed < batchSize) {
          const team = teams[this._currentTeamIndex];
          let teamBox = new St.BoxLayout({
            style_class: 'team-selector-team-row',
            reactive: true,
            track_hover: true,
          });

          let checkbox = new CheckBox.CheckBox(team.name);
          checkbox.checked = this._followedTeams.includes(team.id.toString());

          this._teamCheckboxes.set(team.id.toString(), checkbox);

          teamBox.add_child(checkbox);

          // Make the whole row clickable
          teamBox.connect('button-press-event', () => {
            checkbox.checked = !checkbox.checked;
            return Clutter.EVENT_STOP;
          });

          this._contentBox.add_child(teamBox);
          this._currentTeamIndex++;
          teamsProcessed++;
        }

        if (this._currentTeamIndex >= teams.length) {
          // Finished this league, add separator
          let separator = new St.Widget({
            style_class: 'team-selector-separator',
            height: 1,
          });
          this._contentBox.add_child(separator);
          this._currentLeagueIndex++;
          this._currentTeamIndex = 0;
        }
      }

      // If more to process, schedule next batch
      if (this._currentLeagueIndex < this._leagues.length) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 10, () => {
          this._populateNextBatch();
          return GLib.SOURCE_REMOVE;
        });
      }
    }

    _onCancel() {
      this.close();
    }

    _onSave() {
      const followedTeams = [];

      for (const [teamId, checkbox] of this._teamCheckboxes.entries()) {
        if (checkbox.checked) {
          followedTeams.push(teamId);
        }
      }

      this._settings.set_strv('followed-teams', followedTeams);
      this.close();
    }
  }
);
