import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import * as CONSTANTS from "../const.js";

export const TeamSelectorDialog = GObject.registerClass(
  class TeamSelectorDialog extends ModalDialog.ModalDialog {
    _init(client, settings) {
      super._init({ styleClass: 'team-selector-dialog' });

      this._client = client;
      this._settings = settings;

      // Dialog title
      let titleLabel = new St.Label({
        text: 'Select Teams to Follow',
        style_class: 'team-selector-title',
      });
      this.contentLayout.add_child(titleLabel);

      // Scrollable content area
      let scrollView = new St.ScrollView({
        style_class: 'team-selector-scroll',
        x_expand: true,
        y_expand: true,
        overlay_scrollbars: true,
      });

      this._contentBox = new St.BoxLayout({
        style_class: 'team-selector-content',
        vertical: true,
      });

      scrollView.add_child(this._contentBox);
      this.contentLayout.add_child(scrollView);

      // Close button
      this.setButtons([
        {
          label: 'Close',
          action: () => {
            this.close();
          },
          key: Clutter.KEY_Escape,
        },
      ]);

      // Populate with teams
      this._populateTeamSelector();
    }

    async _populateTeamSelector() {
      try {
        console.log('TeamSelector: Loading constants...');
        await CONSTANTS.getConstants();
        
        const leagues = Object.keys(CONSTANTS.SPORTS || {});
        console.log('TeamSelector: Leagues available:', leagues);

        this._contentBox.destroy_all_children();

        if (leagues.length === 0) {
          let noLeaguesLabel = new St.Label({
            text: 'No leagues available. Data may still be loading.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noLeaguesLabel);
          return;
        }

        const followedTeams = this._settings.get_strv('followed-teams');
        console.log('TeamSelector: Currently followed teams:', followedTeams);

        // Create a section for each league
        for (const league of leagues) {
          // League expander button
          let leagueBox = new St.BoxLayout({
            style_class: 'team-selector-league-box',
            vertical: false,
          });

          let leagueButton = new St.Button({
            style_class: 'team-selector-league-button',
            x_expand: true,
          });

          let leagueLabel = new St.Label({
            text: `▶ ${CONSTANTS.DISPLAY_NAME[league] || league}`,
            style_class: 'team-selector-league-header',
          });

          leagueButton.set_child(leagueLabel);
          leagueBox.add_child(leagueButton);
          this._contentBox.add_child(leagueBox);

          // Teams container (initially hidden)
          let teamsContainer = new St.BoxLayout({
            style_class: 'team-selector-teams-container',
            vertical: true,
            visible: false,
          });

          const teams = CONSTANTS.SPORTS[league] || [];
          console.log(`TeamSelector: Teams in ${league}:`, teams.length);

          for (const team of teams) {
            let teamBox = new St.BoxLayout({
              style_class: 'team-selector-row',
              vertical: false,
            });

            let teamLabel = new St.Label({
              text: team.name,
              style_class: 'team-selector-label',
              x_expand: true,
            });

            let teamSwitch = new St.Button({
              style_class: followedTeams.includes(team.id.toString())
                ? 'team-selector-switch team-selector-switch-active'
                : 'team-selector-switch',
              toggle_mode: true,
              checked: followedTeams.includes(team.id.toString()),
              label: followedTeams.includes(team.id.toString()) ? '✓' : '',
            });

            teamSwitch.connect('clicked', () => {
              const currentFollowed = this._settings.get_strv('followed-teams');
              const isFollowed = currentFollowed.includes(team.id.toString());
              
              if (isFollowed) {
                const index = currentFollowed.indexOf(team.id.toString());
                currentFollowed.splice(index, 1);
                teamSwitch.remove_style_class_name('team-selector-switch-active');
                teamSwitch.set_label('');
              } else {
                currentFollowed.push(team.id.toString());
                teamSwitch.add_style_class_name('team-selector-switch-active');
                teamSwitch.set_label('✓');
              }
              this._settings.set_strv('followed-teams', currentFollowed);
              console.log('TeamSelector: Updated followed teams:', currentFollowed);
            });

            teamBox.add_child(teamLabel);
            teamBox.add_child(teamSwitch);
            teamsContainer.add_child(teamBox);
          }

          this._contentBox.add_child(teamsContainer);

          // Toggle teams visibility when league button is clicked
          leagueButton.connect('clicked', () => {
            const isVisible = teamsContainer.get_visible();
            teamsContainer.set_visible(!isVisible);
            leagueLabel.set_text(isVisible ? `▶ ${CONSTANTS.DISPLAY_NAME[league] || league}` : `▼ ${CONSTANTS.DISPLAY_NAME[league] || league}`);
          });

          // Add separator between leagues
          let separator = new St.Widget({
            style_class: 'team-selector-separator',
            height: 1,
          });
          this._contentBox.add_child(separator);
        }
      } catch (error) {
        console.error('TeamSelector: Failed to populate teams:', error);
        this._contentBox.destroy_all_children();
        let errorLabel = new St.Label({
          text: 'Error loading teams: ' + error.message,
          style_class: 'no-teams-label',
        });
        this._contentBox.add_child(errorLabel);
      }
    }
  }
);
