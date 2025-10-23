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

      // Group teams by league
      const leagues = Object.keys(sports);

      for (const league of leagues) {
        // Add league header
        let leagueHeader = new St.Label({
          text: displayNames[league] || league,
          style_class: 'team-selector-league-header',
        });
        this._contentBox.add_child(leagueHeader);

        // Add teams for this league
        const teams = sports[league] || [];
        for (const team of teams) {
          let teamBox = new St.BoxLayout({
            style_class: 'team-selector-team-row',
            reactive: true,
            track_hover: true,
          });

          let checkbox = new CheckBox.CheckBox(team.name);
          checkbox.checked = followedTeams.includes(team.id.toString());

          this._teamCheckboxes.set(team.id.toString(), checkbox);

          teamBox.add_child(checkbox);

          // Make the whole row clickable
          teamBox.connect('button-press-event', () => {
            checkbox.checked = !checkbox.checked;
            return Clutter.EVENT_STOP;
          });

          this._contentBox.add_child(teamBox);
        }

        // Add separator between leagues
        let separator = new St.Widget({
          style_class: 'team-selector-separator',
          height: 1,
        });
        this._contentBox.add_child(separator);
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
