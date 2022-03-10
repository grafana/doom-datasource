#!/bin/sh

# Set version field in package.json based on git branch etc.
# The package.json version field becomes the plugin version.

# version by tag if any, or branch-hash otherwise
TAG=$(git describe --tags --exact-match 2>/dev/null)
if [ "" != "$TAG" ]; then
	VERSION="$TAG"
else
	BRANCH=$(git rev-parse --abbrev-ref HEAD | sed 's#/#-#g')
	HASH=$(git rev-parse --short HEAD)
	VERSION="${BRANCH}-${HASH}"
fi

cp package.json package.json.orig
sed -e 's/"version": ".*"/"version": "'${VERSION}'"/' < package.json.orig > package.json

# keep version around in file for CI
echo ${VERSION} > version