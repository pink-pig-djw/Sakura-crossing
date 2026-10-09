#!/usr/bin/env sh
# Build the site and publish dist/ to the gh-pages branch of `origin`.
# GitHub Pages serves it from Settings -> Pages -> "Deploy from a branch" -> gh-pages / (root),
# at https://<user>.github.io/<repo>/ (vite.config.js uses a relative base, so any path works).
set -eu
cd "$(dirname "$0")/.."
npm run build
rev=$(git rev-parse --short HEAD)
remote=$(git remote get-url origin)
name=$(git config user.name || echo deploy)
email=$(git config user.email || echo deploy@localhost)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R dist/. "$tmp"
touch "$tmp/.nojekyll"
cd "$tmp"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Deploy $rev"
git push -f "$remote" gh-pages
echo "published $rev to gh-pages"
