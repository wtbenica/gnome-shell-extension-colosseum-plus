#!/bin/bash

# Build the project and package dist/
set -e
yarn build

# Create zip file from dist
cd dist
zip -r ../arena.zip .

# Install the extension
gnome-extensions install --force ../arena.zip

echo "Extension installed successfully!"