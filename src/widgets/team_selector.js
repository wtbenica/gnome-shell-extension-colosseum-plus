import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import { logInfo, logErr } from "../logging/error_utils.js";

export const TeamSelectorDialog = GObject.registerClass(
  class TeamSelectorDialog extends ModalDialog.ModalDialog {
    _init(settings) {
      super._init({ styleClass: 'team-selector-dialog' });

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
        logInfo('TeamSelector: Starting to populate team selector');
        this._contentBox.destroy_all_children();
        
        // Fetch competitions from Sportradar (filtered to 4 leagues)
        const DataLoader = (await import('../data.js')).default;
        logInfo('TeamSelector: Fetching competitions from DataLoader');
        const competitions = await DataLoader.fetchCompetitions();
        
        if (!competitions || competitions.length === 0) {
          logInfo('TeamSelector: No competitions available');
          let noLeaguesLabel = new St.Label({
            text: 'No competitions available. Data may still be loading.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noLeaguesLabel);
          return;
        }

        logInfo('TeamSelector: Got', competitions.length, 'competitions');

        // Fetch teams for all competitions
        let allTeams = [];
        for (const comp of competitions) {
          logInfo('TeamSelector: Fetching teams for', comp.name);
          const teams = await DataLoader.fetchCompetitionInfo(comp.id);
          if (teams && teams.length > 0) {
            // Add league name to each team
            teams.forEach(team => {
              team.leagueName = comp.name;
            });
            allTeams = allTeams.concat(teams);
          }
        }

        logInfo('TeamSelector: Total teams collected:', allTeams.length);

        if (allTeams.length === 0) {
          let noTeamsLabel = new St.Label({
            text: 'No teams available.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noTeamsLabel);
          return;
        }

        // Sort teams by league then name
        allTeams.sort((a, b) => {
          if (a.leagueName !== b.leagueName) {
            return a.leagueName.localeCompare(b.leagueName);
          }
          return a.name.localeCompare(b.name);
        });

        // Get followed teams
        const followedTeams = this._settings.get_strv('followed-teams');

        // Display teams with checkboxes
        let currentLeague = null;
        for (const team of allTeams) {
          // Add league header if new league
          if (currentLeague !== team.leagueName) {
            currentLeague = team.leagueName;
            let leagueLabel = new St.Label({
              text: team.leagueName,
              style_class: 'team-selector-league-header',
              x_expand: true,
            });
            this._contentBox.add_child(leagueLabel);
          }

          let teamBox = new St.BoxLayout({
            style_class: 'team-selector-team-row',
            vertical: false,
          });
          
          let teamLabel = new St.Label({
            text: team.name,
            style_class: 'team-selector-team-label',
            x_expand: true,
          });
          
          const teamId = String(team.id);
          const isFollowed = followedTeams.includes(teamId);
          
          let teamSwitch = new St.Button({
            style_class: isFollowed
              ? 'team-selector-switch team-selector-switch-active'
              : 'team-selector-switch',
            label: isFollowed ? '✓' : '',
            x_align: Clutter.ActorAlign.END,
          });
          
          teamSwitch.connect('clicked', () => {
            let currentFollowed = this._settings.get_strv('followed-teams');
            const index = currentFollowed.indexOf(teamId);
            
            if (index >= 0) {
              currentFollowed.splice(index, 1);
              teamSwitch.remove_style_class_name('team-selector-switch-active');
              teamSwitch.set_label('');
              logInfo('TeamSelector: Unfollowed team:', team.name);
            } else {
              currentFollowed.push(teamId);
              teamSwitch.add_style_class_name('team-selector-switch-active');
              teamSwitch.set_label('✓');
              logInfo('TeamSelector: Followed team:', team.name);
            }
            
            this._settings.set_strv('followed-teams', currentFollowed);
          });
          
          teamBox.add_child(teamLabel);
          teamBox.add_child(teamSwitch);
          this._contentBox.add_child(teamBox);
        }
        
        logInfo('TeamSelector: Population complete');
      } catch (error) {
        logErr(error, 'TeamSelector: Failed to populate team selector');
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
