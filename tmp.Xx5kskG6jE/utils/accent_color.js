import Gio from 'gi://Gio';
import { logErr } from '../utils/logging.js';
// GNOME accent color names mapped to hex values
export const ACCENT_MAP_LIGHT = {
    blue: "#81D0FF",
    teal: "#7bdff4",
    green: "#8de698",
    yellow: "#ffc057",
    orange: "#ff9c5b",
    red: "#ff888c",
    pink: "#ffa0d8",
    purple: "#fba7ff",
    slate: "#bbd1e5",
};
export const ACCENT_MAP = {
    blue: "#3584E4",
    teal: "#2190A4",
    green: "#3A944A",
    yellow: "#C88800",
    orange: "#ED5B00",
    red: "#E62D42",
    pink: "#D56199",
    purple: "#9141AC",
    slate: "#6F8396",
};
export const ACCENT_MAP_DARK = {
    blue: "#0461be",
    teal: "#007184",
    green: "#15772e",
    yellow: "#905300",
    orange: "#b62200",
    red: "#c0023",
    pink: "#a2326c",
    purple: "#8939a4",
    slate: "#526678",
};
/**
 * Get the current GNOME accent color as a hex string.
 * Returns the accent color if set, otherwise falls back to blue.
 */
export function getAccentColor() {
    try {
        const ifaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
        const accentName = ifaceSettings.get_string('accent-color');
        if (accentName) {
            const normalized = accentName.trim().toLowerCase();
            return ACCENT_MAP_LIGHT[normalized] || '#3584E4'; // fallback to blue
        }
    }
    catch (error) {
        logErr(error, 'Error message');
    }
    return '#3584E4'; // default blue
}
