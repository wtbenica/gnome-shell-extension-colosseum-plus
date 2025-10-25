#!/usr/bin/env bash

# Colosseum GNOME Extension Install Script
# This script installs the extension and compiles the GSettings schema system-wide

set -euo pipefail

EXT_NAME="colosseum@sereneblue"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_NAME"
SCHEMA_DIR="/usr/share/glib-2.0/schemas"
SCHEMA_FILE="org.gnome.shell.extensions.colosseum.gschema.xml"

echo "Installing Colosseum GNOME Extension..."

# Check if we're in the right directory
if [[ ! -f "build.sh" || ! -d "src" ]]; then
    echo "Error: Please run this script from the extension root directory"
    exit 1
fi



# Build the extension (TypeScript + GNOME 45)
echo "Building extension (TypeScript + GNOME 45)..."
./build.sh





# Prepare a temporary packaging directory
PKG_DIR=$(mktemp -d)
cp -r dist/* "$PKG_DIR/"
cp -r src/schemas "$PKG_DIR/"
cp -r src/icon "$PKG_DIR/"
cp -r src/ui "$PKG_DIR/"
cp src/stylesheet.css "$PKG_DIR/"
cp src/metadata.json "$PKG_DIR/"
    echo "Building extension..."
# Create the extension zip manually
#!/usr/bin/env bash

# Colosseum GNOME Extension Install Script
# This script installs the extension and compiles the GSettings schema for the user

set -euo pipefail

EXT_NAME="colosseum@sereneblue"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_NAME"
SCHEMA_FILE="org.gnome.shell.extensions.colosseum.gschema.xml"

echo "Installing Colosseum GNOME Extension..."

# Ensure we are run from project root
if [[ ! -f "build.sh" || ! -d "src" ]]; then
    echo "Error: Please run this script from the extension root directory"
    exit 1
fi

# Build the extension (TypeScript + packaging)
echo "Building extension (TypeScript + GNOME 45)..."
./build.sh

# Prefer zips produced by the build
SHELL_EXT_ZIP="colosseum@sereneblue.shell-extension.zip"
ALT_ZIP="colosseum_45.zip"

if [[ -f "$SHELL_EXT_ZIP" ]]; then
    ZIP_TO_INSTALL="$SHELL_EXT_ZIP"
elif [[ -f "$ALT_ZIP" ]]; then
    ZIP_TO_INSTALL="$ALT_ZIP"
else
    # No pre-made zip found, create one from dist/ + runtime assets
    PKG_DIR=$(mktemp -d)
    echo "Creating package in $PKG_DIR"

    # Use absolute path to avoid cwd issues
    cp -r "$PWD/dist/"* "$PKG_DIR/" 2>/dev/null || true
    [[ -d src/schemas ]] && cp -r src/schemas "$PKG_DIR/"
    [[ -d src/icon ]] && cp -r src/icon "$PKG_DIR/"
    [[ -d src/ui ]] && cp -r src/ui "$PKG_DIR/"
    [[ -f src/stylesheet.css ]] && cp src/stylesheet.css "$PKG_DIR/"
    [[ -f src/metadata.json ]] && cp src/metadata.json "$PKG_DIR/"

    pushd "$PKG_DIR" >/dev/null
    zip -r -q "$OLDPWD/$SHELL_EXT_ZIP" .
    popd >/dev/null
    rm -rf "$PKG_DIR"
    ZIP_TO_INSTALL="$SHELL_EXT_ZIP"
fi

echo "Using zip: $ZIP_TO_INSTALL"

# Install the extension zip using gnome-extensions if available, else unpack to user dir
if command -v gnome-extensions >/dev/null 2>&1; then
    echo "Installing via gnome-extensions..."
    gnome-extensions install --force "$ZIP_TO_INSTALL"
    echo "Installed via gnome-extensions."
else
    echo "gnome-extensions CLI not found. Falling back to user-local install." >&2
    mkdir -p "$EXT_DIR"
    echo "Extracting $ZIP_TO_INSTALL to $EXT_DIR"
    unzip -q -o "$ZIP_TO_INSTALL" -d "$EXT_DIR"

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

echo "Installation complete!"
echo
echo "Next steps:"
echo "1. Log out and log back in to restart GNOME Shell"
echo "2. Enable the extension in GNOME Extensions or GNOME Tweaks"
echo "3. Configure your followed teams in the extension preferences"
echo
