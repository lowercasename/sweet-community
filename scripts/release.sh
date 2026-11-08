#!/bin/sh
# Releases main as a new version (architecture.md, Updates). It names the next version from the newest tag, adds an
# entry to CHANGELOG.md made of the commit titles since that tag, commits, tags and pushes. The pushed tag makes CI
# publish the image ghcr.io/lowercasename/sweet-community:<version>, which a server pins with SWEET_IMAGE.
#
#   scripts/release.sh patch     fixes and wording
#   scripts/release.sh minor     a new feature
#   scripts/release.sh major     a change that needs the people running Sweet to act
#   scripts/release.sh v1.0.0    a version by name, such as the first release
#
# RELEASE_TRAILER, when set, is added as the last line of the release commit's message.
set -eu

kind=${1:-}
[ -n "$kind" ] || { echo "Usage: scripts/release.sh patch|minor|major|vX.Y.Z" >&2; exit 2; }
cd "$(git rev-parse --show-toplevel)"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Release from main." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash the changes first." >&2; exit 1; }
git fetch -q --tags origin

last=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)
case "$kind" in
  v[0-9]*.[0-9]*.[0-9]*)
    next=$kind
    ;;
  patch | minor | major)
    [ -n "$last" ] || { echo "There is no release yet. Name the first one, such as v1.0.0." >&2; exit 1; }
    v=${last#v}
    major=${v%%.*}
    rest=${v#*.}
    minor=${rest%%.*}
    patch=${rest#*.}
    case "$kind" in
      patch) patch=$((patch + 1)) ;;
      minor) minor=$((minor + 1)); patch=0 ;;
      major) major=$((major + 1)); minor=0; patch=0 ;;
    esac
    next="v$major.$minor.$patch"
    ;;
  *)
    echo "Usage: scripts/release.sh patch|minor|major|vX.Y.Z" >&2
    exit 2
    ;;
esac
if git rev-parse -q --verify "refs/tags/$next" >/dev/null; then
  echo "$next already exists." >&2
  exit 1
fi

if [ -n "$last" ]; then
  notes=$(git log --no-merges --format='- %s' "$last..HEAD")
  [ -n "$notes" ] || { echo "Nothing has changed since $last." >&2; exit 1; }
else
  notes='- The first release.'
fi

# The changelog lists the newest release first, under its title.
{
  printf '# Changelog\n\n## %s (%s)\n\n%s\n' "$next" "$(date -u +%Y-%m-%d)" "$notes"
  if [ -f CHANGELOG.md ]; then
    printf '\n'
    tail -n +3 CHANGELOG.md
  fi
} > CHANGELOG.md.next
mv CHANGELOG.md.next CHANGELOG.md

git add CHANGELOG.md
if [ -n "${RELEASE_TRAILER:-}" ]; then
  git commit -q -m "Release $next" -m "$RELEASE_TRAILER"
else
  git commit -q -m "Release $next"
fi
git tag -a "$next" -m "$next"
git push -q origin main "$next"
echo "Released $next."
