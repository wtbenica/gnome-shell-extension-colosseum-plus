#!/bin/bash

# Build the project
yarn build

# Copy additional files to dist/
cp .env dist/
cp -r src/schemas dist/
cp src/metadata.json dist/
cp stylesheet.css dist/
cp -r src/ui dist/
cp -r src/icon dist/

# Create zip file
cd dist
zip -r ../colosseum.zip .

# Install the extension
gnome-extensions install --force ../colosseum.zip

echo "Extension installed successfully!"