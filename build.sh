#!/usr/bin/env bash
set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORK_DIR=$(mktemp -d -p "$DIR")

function cleanup {
  rm -rf "$WORK_DIR" || true
  echo "Deleted temp working directory $WORK_DIR"
}

trap cleanup EXIT

if [[ -z "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
  echo "Could not create temp dir"
  exit 1
fi

echo "Using work dir: $WORK_DIR"

# Ensure we have a TypeScript compiler available. Prefer yarn, fall back to npx
echo "Ensuring TypeScript compiler is available..."
if command -v yarn >/dev/null 2>&1; then
  PM_CMD="yarn"
elif command -v npm >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
  PM_CMD="npx"
else
  echo "ERROR: Neither yarn nor npx is available. Please install yarn or npm (with npx)." >&2
  exit 1
fi

# Install node modules if node_modules/ is missing
if [[ ! -d "node_modules" ]]; then
  echo "node_modules/ not found — installing dependencies with $PM_CMD..."
  if [[ "$PM_CMD" == "yarn" ]]; then
    yarn install --silent
  else
    npm install --no-audit --no-fund --silent
  fi
fi

echo "Compiling TypeScript (using $PM_CMD tsc -p tsconfig.json)..."
if [[ "$PM_CMD" == "yarn" ]]; then
  yarn tsc -p tsconfig.json
else
  npx tsc -p tsconfig.json
fi

if [[ ! -d "dist" ]]; then
  echo "ERROR: dist/ directory not created by tsc." >&2
  exit 1
fi

# Ensure UI assets and other runtime assets are included in dist so dist is self-contained
if [[ -d src/ui ]]; then
  echo "Copying UI files into dist/..."
  mkdir -p dist/ui
  cp -r src/ui/* dist/ui/
fi
if [[ -f src/stylesheet.css ]]; then
  cp src/stylesheet.css dist/
fi
if [[ -f src/metadata.json ]]; then
  cp src/metadata.json dist/
fi

# If there's a project .env file, include it in dist so the extension can load it at runtime
if [[ -f .env ]]; then
  echo "Copying .env into dist/ (will be packaged into shell-extension zip)"
  cp .env dist/
fi

# Remove TypeScript-only artifacts (declarations/maps) from dist to keep it JS-only
echo "Stripping TypeScript declaration files from dist/..."
find dist -type f \( -name '*.d.ts' -o -name '*.d.ts.map' -o -name '*.d.ts.*' -o -name '*.d.ts.map.*' \) -delete || true
# Exclude .ts files from dist
find dist -type f -name '*.ts' -delete || true

# Copy prepared dist contents into the temporary packaging directory
echo "Copying files into temporary packaging directory..."
cp -r dist/* "$WORK_DIR/" || true

# Also include non-compiled assets (schemas, icon, ui) from src into the work dir
if [[ -d src/schemas ]]; then
  cp -r src/schemas "$WORK_DIR/" || true
fi
if [[ -d src/icon ]]; then
  cp -r src/icon "$WORK_DIR/" || true
fi
if [[ -d src/ui ]]; then
  cp -r src/ui "$WORK_DIR/" || true
fi
if [[ -f src/stylesheet.css ]]; then
  cp src/stylesheet.css "$WORK_DIR/" || true
fi
if [[ -f src/metadata.json ]]; then
  cp src/metadata.json "$WORK_DIR/" || true
fi

# Do NOT include compiled schema binaries in the zip
if [[ -d "$WORK_DIR/schemas" ]]; then
  find "$WORK_DIR/schemas" -name 'gschemas.compiled' -delete || true
fi

# Create a single GNOME-friendly shell-extension zip from the work dir
ZIP_NAME="${DIR}/colosseum@sereneblue.shell-extension.zip"
echo "Creating zip: $ZIP_NAME"
pushd "$WORK_DIR" >/dev/null
zip -r -q "$ZIP_NAME" .
popd >/dev/null

echo "Build complete. Zip created at: $ZIP_NAME"