#!/usr/bin/env bash
# Publica una release en GitHub con la app empaquetada (Apple Silicon).
#   1. Sube "version" en package.json y haz commit.
#   2. (Opcional) Escribe las notas en docs/releases/vX.Y.Z.md.
#   3. npm run release
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
ZIP="release/Zepo-Desk-$VERSION-mac-arm64.zip"
NOTES="docs/releases/$TAG.md"

if [ -n "$(git status --porcelain)" ]; then
	echo "Hay cambios sin commit: haz commit antes de publicar." >&2
	exit 1
fi
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
	echo "La etiqueta $TAG ya existe: sube la versión en package.json." >&2
	exit 1
fi

npm test
npm run app:build

rm -f "$ZIP"
# ditto conserva la firma y los enlaces simbólicos del .app (zip a secas los rompe).
ditto -c -k --sequesterRsrc --keepParent "release/mac-arm64/Zepo Desk.app" "$ZIP"

git tag -a "$TAG" -m "Zepo Desk $VERSION"
git push origin HEAD "$TAG"

if [ -f "$NOTES" ]; then
	gh release create "$TAG" "$ZIP" --title "Zepo Desk $VERSION" --notes-file "$NOTES"
else
	gh release create "$TAG" "$ZIP" --title "Zepo Desk $VERSION" --generate-notes
fi
echo "Publicada $TAG"
