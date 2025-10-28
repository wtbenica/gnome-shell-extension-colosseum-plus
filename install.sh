#!/bin/bash

# Build the project and package dist/
set -e
yarn build

# Create zip file from dist
cd dist
zip -r ../colosseum.zip .

# Install the extension
gnome-extensions install --force ../colosseum.zip

echo "Extension installed successfully!"