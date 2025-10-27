/*
 * SPDX-FileCopyrightText: 2024 Wesley Benica <wesley@benica.dev>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
/**
 * Logger implementation for GJS/GNOME Shell environment.
 */
export const gjsLogger = {
    log(...args) {
        if (typeof (globalThis).log === "function") {
            (globalThis).log(...args);
        }
    },
    logError(error, message) {
        if (typeof (globalThis).logError === "function") {
            (globalThis).logError(error, message);
        }
    },
};
