import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Meta from "gi://Meta";
import St from "gi://St";

import * as Config from "resource:///org/gnome/shell/misc/config.js";

export const GameLink = GObject.registerClass(
  class GameLink extends St.Label {
    constructor(url) {
      // Provide a minimal label so the widget has content and can receive events
      super({ text: "" });
      this._url = url || null;
      this._cursorChanged = false;
    }

    vfunc_button_press_event(_event) {
      if (!this.visible || this.get_paint_opacity() === 0)
        return Clutter.EVENT_PROPAGATE;

      return true;
    }

    vfunc_button_release_event(_event) {
      if (!this.visible || this.get_paint_opacity() === 0)
        return Clutter.EVENT_PROPAGATE;

      Gio.app_info_launch_default_for_uri(
        this._url,
        global.create_app_launch_context(0, -1),
      );

      return Clutter.EVENT_STOP;
    }

    vfunc_motion_event(_event) {
      if (!this.visible || this.get_paint_opacity() === 0)
        return Clutter.EVENT_PROPAGATE;

      if (!this._cursorChanged) {
        let cursor = "POINTING_HAND";
        const [major] = Config.PACKAGE_VERSION.split(".").map((s) =>
          Number(s),
        );

        if (major >= 48) {
          cursor = "POINTER";
        }

        global.display.set_cursor(Meta.Cursor[cursor]);
        this._cursorChanged = true;
      }

      return Clutter.EVENT_PROPAGATE;
    }

    vfunc_leave_event(event) {
      if (!this.visible || this.get_paint_opacity() === 0)
        return Clutter.EVENT_PROPAGATE;

      if (this._cursorChanged) {
        this._cursorChanged = false;
        global.display.set_cursor(Meta.Cursor.DEFAULT);
      }

      return super.vfunc_leave_event(event);
    }
  },
);

// Also provide a default export for compatibility with callers using default imports
export default GameLink;
