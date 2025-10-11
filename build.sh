#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORK_DIR=`mktemp -d -p "$DIR"`

function cleanup {      
  rm -rf "$WORK_DIR"
  echo "Deleted temp working directory $WORK_DIR"
}

if [[ ! "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
  echo "Could not create temp dir"
  exit 1
fi

cp -r colosseum@sereneblue/* $WORK_DIR
cp -r versions/45/* $WORK_DIR
pushd $WORK_DIR
# No longer rename _adw UI files; keep the Adwaita/libadwaita variants as canonical
# (prefs_adw.ui, league-row_adw.ui, tournament-row_adw.ui). This avoids
# duplicate/ui-versioning at build time.

sed -i -e 's/var/export const/g' ./const.js

# Compile GSettings schemas into the schemas directory so the zip includes
# a compiled gschemas.compiled (so users can install locally without
# needing system-wide schema installation).
if [[ -d "$WORK_DIR/schemas" ]]; then
	if command -v glib-compile-schemas >/dev/null 2>&1; then
		glib-compile-schemas "$WORK_DIR/schemas"
	else
		echo "Warning: glib-compile-schemas not found; schemas will not be compiled into the zip."
	fi
fi

zip -r ../colosseum_45.zip .
popd

trap cleanup EXIT