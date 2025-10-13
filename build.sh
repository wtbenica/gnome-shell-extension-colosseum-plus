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

cp -r src/* $WORK_DIR
pushd $WORK_DIR

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