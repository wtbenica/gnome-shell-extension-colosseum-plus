#!/usr/bin/env bash

# Colosseum GNOME Extension Install Script
# This script installs the extension and compiles the GSettings schema for the user

set -euo pipefail

EXT_NAME="colosseum@sereneblue"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_NAME"
SCHEMA_FILE="org.gnome.shell.extensions.colosseum.gschema.xml"
ZIP_FILE="colosseum@sereneblue.shell-extension.zip"

echo "Installing Colosseum GNOME Extension..."

# Ensure we are run from project root
if [[ ! -f "build.sh" || ! -d "src" ]]; then
    echo "Error: Please run this script from the extension root directory"
    exit 1
fi

# Build the extension (TypeScript + packaging)
echo "Building extension (TypeScript + GNOME 45)..."
./build.sh

# Check if zip exists
if [[ ! -f "$ZIP_FILE" ]]; then
    echo "Error: Extension zip not found at $ZIP_FILE"
    echo "Build may have failed. Please check build.sh output."
    exit 1
fi

echo "Using extension zip: $ZIP_FILE"

# Install the extension zip using gnome-extensions if available, else unpack to user dir
if command -v gnome-extensions >/dev/null 2>&1; then
    echo "Installing via gnome-extensions..."
    gnome-extensions install --force "$ZIP_FILE"
    echo "Installed via gnome-extensions."
else
    echo "gnome-extensions CLI not found. Falling back to user-local install." >&2
    mkdir -p "$EXT_DIR"
    echo "Extracting $ZIP_FILE to $EXT_DIR"
    unzip -q -o "$ZIP_FILE" -d "$EXT_DIR"

    # If package contains a GSettings schema, copy it to the user's schema dir and recompile
    if [[ -f "$EXT_DIR/schemas/$SCHEMA_FILE" ]]; then
        USER_SCHEMA_DIR="$HOME/.local/share/glib-2.0/schemas"
        mkdir -p "$USER_SCHEMA_DIR"
        cp -f "$EXT_DIR/schemas/$SCHEMA_FILE" "$USER_SCHEMA_DIR/"
        if command -v glib-compile-schemas >/dev/null 2>&1; then
            glib-compile-schemas "$USER_SCHEMA_DIR"
        else
            echo "Warning: glib-compile-schemas not found; you may need to run it manually for GSettings to take effect." >&2
        fi
    fi

    echo "User-local install complete. Enable the extension in GNOME Extensions or via gsettings as needed."
fi

# Copy .env file to extension directory if it exists (for API key)
if [[ -f ".env" ]]; then
    echo "Copying .env file for API key..."
    cp .env "$EXT_DIR/.env" 2>/dev/null || true
fi

echo "Installation complete!"
echo
echo "Next steps:"
echo "1. Log out and log back in to restart GNOME Shell (or press Alt+F2, type 'r', press Enter)"
echo "2. Enable the extension in GNOME Extensions or GNOME Tweaks"
echo "3. Configure your followed teams in the extension preferences"
echo
