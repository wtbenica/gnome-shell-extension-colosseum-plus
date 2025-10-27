import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";
import Gio from "gi://Gio";
import * as ModalDialog from "resource:///org/gnome/shell/ui/modalDialog.js";

import { logErr } from "../utils/logging.js";
import DataLoader from "../data/data_loader.js";

export const TeamSelectorDialog = GObject.registerClass(
  class TeamSelectorDialog extends ModalDialog.ModalDialog {
    constructor(settings) {
      super({ styleClass: 'team-selector-dialog' });

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
        this._contentBox.destroy_all_children();

        // Fetch competitions from Sportradar (filtered to 4 leagues)
        const competitions = await DataLoader.fetchCompetitions();

        if (!competitions || competitions.length === 0) {
          let noLeaguesLabel = new St.Label({
            text: 'No competitions available. Data may still be loading.',
            style_class: 'no-teams-label',
          });
          this._contentBox.add_child(noLeaguesLabel);
          return;
        }

        // For each competition, create a league container and show a placeholder header immediately.
        const followed = this._settings.get_strv('followed-teams');
        // determine accent color from system settings (fallback to stylesheet color)
        let accentColor = '#ffd966';
        try {
          const ifaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
          const ac = ifaceSettings.get_string('accent-color');
          if (ac) accentColor = ac;
        } catch (e) {
          logErr(e, 'TeamSelector: Failed to get accent color from system settings');
        }

        // Start all competition fetches concurrently while showing headers immediately.
        const fetchPromises = [];

        for (const comp of competitions) {
          // Create a per-league container so we can display the header immediately
          const leagueContainer = new St.BoxLayout({ style_class: 'team-selector-league-container', vertical: true });
          const leagueLabel = new St.Label({ text: comp.name, style_class: 'team-selector-league-header', x_expand: true });
          leagueContainer.add_child(leagueLabel);

          // Add a small status placeholder which we'll replace when teams arrive
          const statusLabel = new St.Label({ text: comp._placeholder ? 'Not cached' : 'Loading teams...', style_class: 'team-selector-league-status' });
          leagueContainer.add_child(statusLabel);

          // Add the container to the main content box so the header is visible immediately
          this._contentBox.add_child(leagueContainer);

          // Start fetch but don't await here; store the promise and associated metadata
          fetchPromises.push({
            comp,
            leagueContainer,
            statusLabel,
            promise: DataLoader.fetchCompetitionInfo(comp.id),
          });
        }

        // Await all fetches but handle per-request failures so one failure doesn't abort all updates
        const settled = await Promise.allSettled(fetchPromises.map(p => p.promise));

        for (let i = 0; i < fetchPromises.length; i++) {
          const { comp, leagueContainer, statusLabel } = fetchPromises[i];
          const result = settled[i];

          if (result.status === 'fulfilled') {
            const teams = result.value;
            if (teams && teams.length > 0) {
              teams.forEach(team => (team.leagueName = comp.name));

              // Sort this competition's teams by name for stable order
              teams.sort((a, b) => a.name.localeCompare(b.name));

              // Remove the status label and render this competition's teams into the league container
              leagueContainer.remove_child(statusLabel);
              this._renderTeamsBatchedForLeague(teams, comp.name, followed, leagueContainer, accentColor);
            } else {
              // Update the status label to indicate no teams are available
              statusLabel.set_text(comp._placeholder ? 'Not cached' : 'No teams available');
            }
          } else {
            // Fetch failed for this competition; log and show an error indicator in the UI
            logErr(result.reason, `TeamSelector: Failed to fetch teams for competition ${comp.id}`);
            statusLabel.set_text('Error loading teams');
          }
        }

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

    _renderTeamsBatched(allTeams, followedTeams, accentColor) {
      this._batchIndex = 0;
      this._allTeams = allTeams;
      this._followedCache = new Set(followedTeams || []);
      this._currentLeague = null;

      const batchSize = 20; // tuneable

      const processBatch = () => {
        let processed = 0;
        while (this._batchIndex < this._allTeams.length && processed < batchSize) {
          const team = this._allTeams[this._batchIndex];

          // Add league header if needed
          if (this._currentLeague !== team.leagueName) {
            this._currentLeague = team.leagueName;
            let leagueLabel = new St.Label({
              text: team.leagueName,
              style_class: 'team-selector-league-header',
              x_expand: true,
            });
            this._contentBox.add_child(leagueLabel);
          }

          let teamBox = new St.BoxLayout({ style_class: 'team-selector-team-row', vertical: false });
          let teamLabel = new St.Label({ text: team.name, style_class: 'team-selector-team-label', x_expand: true });
          const teamId = String(team.id);
          const isFollowed = this._followedCache ? this._followedCache.has(teamId) : false;
          // apply followed styling if currently followed
          if (isFollowed) {
            teamLabel.add_style_class_name('team--followed');
            if (accentColor) {
              try {
                teamLabel.set_style(`color: ${accentColor}; font-weight: 800;`);
              } catch (e) {
                logErr(e, 'Failed to set style for teamLabel');
              }
            }
            try {
              teamBox.add_style_class_name('team--followed');
            } catch (e) {
              logErr(e, 'Failed to add style class to teamBox');
            }
          }

          let teamSwitch = new St.Button({
            style_class: isFollowed ? 'team-selector-switch team-selector-switch-active' : 'team-selector-switch',
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
              teamLabel.remove_style_class_name('team--followed');
              try { teamLabel.set_style(''); } catch (e) { logErr(e, 'Failed to reset style for teamLabel'); }
              try { teamBox.remove_style_class_name('team--followed'); } catch (e) { logErr(e, 'Failed to remove style class from teamBox'); }
            } else {
              currentFollowed.push(teamId);
              teamSwitch.add_style_class_name('team-selector-switch-active');
              teamSwitch.set_label('✓');
              teamLabel.add_style_class_name('team--followed');
              try {
                if (accentColor) teamLabel.set_style(`color: ${accentColor}; font-weight: 800;`);
              } catch (e) { logErr(e, 'Failed to set style for teamLabel'); }
              try { teamBox.add_style_class_name('team--followed'); } catch (e) { logErr(e, 'Failed to add style class to teamBox'); }
            }
            this._settings.set_strv('followed-teams', currentFollowed);
          });

          teamBox.add_child(teamLabel);
          teamBox.add_child(teamSwitch);
          this._contentBox.add_child(teamBox);

          this._batchIndex++;
          processed++;
        }

        if (this._batchIndex < this._allTeams.length) {
          GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 10, () => {
            processBatch();
            return GLib.SOURCE_REMOVE;
          });
        }
      };

      // Kick off first batch
      GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 10, () => {
        processBatch();
        return GLib.SOURCE_REMOVE;
      });
    }

    _renderTeamsBatchedForLeague(teams, leagueName, followedTeams, container, accentColor) {
      let batchIndex = 0;
      const batchSize = 12; // per-league batch size
      const followedCache = new Set(followedTeams || []);

      // If a container was provided (created by _populateTeamSelector), use it; otherwise create one and add a header
      let leagueContainer = container;
      if (!leagueContainer) {
        leagueContainer = new St.BoxLayout({ style_class: 'team-selector-league-container', vertical: true });
        const leagueLabel = new St.Label({ text: leagueName, style_class: 'team-selector-league-header', x_expand: true });
        leagueContainer.add_child(leagueLabel);
        this._contentBox.add_child(leagueContainer);
      }

      const processBatch = () => {
        let processed = 0;
        while (batchIndex < teams.length && processed < batchSize) {
          const team = teams[batchIndex];

          let teamBox = new St.BoxLayout({ style_class: 'team-selector-team-row', vertical: false });
          let teamLabel = new St.Label({ text: team.name, style_class: 'team-selector-team-label', x_expand: true });

          const teamId = String(team.id);
          const isFollowed = followedCache.has(teamId);
          // apply followed styling if currently followed
          if (isFollowed) {
            teamLabel.add_style_class_name('team--followed');
            if (accentColor) {
              try {
                teamLabel.set_style(`color: ${accentColor}; font-weight: 800;`);
              } catch (e) {
                logErr(e, 'Failed to set style for teamLabel');
              }
            }
            try {
              teamBox.add_style_class_name('team--followed');
            } catch (e) {
              logErr(e, 'Failed to add style class to teamBox');
            }
          }

          let teamSwitch = new St.Button({
            style_class: isFollowed ? 'team-selector-switch team-selector-switch-active' : 'team-selector-switch',
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
              followedCache.delete(teamId);
              teamLabel.remove_style_class_name('team--followed');
              try { teamLabel.set_style(''); } catch (e) { logErr(e, 'Failed to reset style for teamLabel'); }
              try { teamBox.remove_style_class_name('team--followed'); } catch (e) { logErr(e, 'Failed to remove style class from teamBox'); }
            } else {
              currentFollowed.push(teamId);
              teamSwitch.add_style_class_name('team-selector-switch-active');
              teamSwitch.set_label('✓');
              followedCache.add(teamId);
              teamLabel.add_style_class_name('team--followed');
              try {
                if (accentColor) teamLabel.set_style(`color: ${accentColor}; font-weight: 800;`);
              } catch (e) { logErr(e, 'Failed to set style for teamLabel'); }
              try { teamBox.add_style_class_name('team--followed'); } catch (e) { logErr(e, 'Failed to add style class to teamBox'); }
            }
            this._settings.set_strv('followed-teams', currentFollowed);
          });

          teamBox.add_child(teamLabel);
          teamBox.add_child(teamSwitch);
          leagueContainer.add_child(teamBox);

          batchIndex++;
          processed++;
        }

        if (batchIndex < teams.length) {
          GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 10, () => {
            processBatch();
            return GLib.SOURCE_REMOVE;
          });
        }
      };

      // Kick off first per-league batch
      GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 10, () => {
        processBatch();
        return GLib.SOURCE_REMOVE;
      });
    }
  }
);
