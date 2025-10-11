#!/bin/bash

# Colosseum GNOME Extension Install Script
# This script installs the extension and compiles the GSettings schema system-wide

set -e

EXT_NAME="colosseum@sereneblue"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_NAME"
SCHEMA_DIR="/usr/share/glib-2.0/schemas"
SCHEMA_FILE="org.gnome.shell.extensions.colosseum.gschema.xml"

echo "Installing Colosseum GNOME Extension..."

# Check if we're in the right directory
if [[ ! -f "build.sh" || ! -d "colosseum@sereneblue" ]]; then
    echo "Error: Please run this script from the extension root directory"
    exit 1
fi

# Build the extension (default to GNOME 45)
echo "Building extension (GNOME 45)..."
./build.sh

# Extract to extensions directory
echo "Extracting extension to $EXT_DIR..."
mkdir -p "$EXT_DIR"
unzip -o colosseum_45.zip -d "$EXT_DIR/"

# Compile local GSettings schemas in the extension directory (no sudo)
if [[ -d "$EXT_DIR/schemas" ]]; then
    if command -v glib-compile-schemas >/dev/null 2>&1; then
        echo "Compiling GSettings schemas in $EXT_DIR/schemas"
        glib-compile-schemas "$EXT_DIR/schemas"
    else
        echo "Warning: glib-compile-schemas not found; you may need to install it or compile schemas system-wide."
    fi
fi

echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Log out and log back in to restart GNOME Shell"
echo "2. Enable the extension in GNOME Extensions or GNOME Tweaks"
echo "3. Configure your followed teams in the extension preferences"
echo ""
echo "The extension should now be visible in the top bar at all times."