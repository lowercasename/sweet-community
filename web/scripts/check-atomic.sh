#!/bin/sh
# Component rule: raw HTML tags live only in src/ui/. Composites (src/components)
# and pages (src/pages) must be built from ui primitives and other components.
# Fails if any raw tag below appears in those directories.
cd "$(dirname "$0")/.." || exit 1

pattern='<(div|span|p|a|button|h[1-6]|form|input|textarea|label|time|hr|ul|ol|li|img|section|article|header|footer|nav|main)[[:space:]/>]'

hits=$(grep -rnE "$pattern" src/components src/pages 2>/dev/null)
if [ -n "$hits" ]; then
  echo "check:atomic failed. Raw HTML tags outside src/ui/:"
  echo "$hits"
  exit 1
fi

# The one place dangerouslySetInnerHTML is allowed is src/ui/HtmlContent.tsx.
bad=$(grep -rln 'dangerouslySetInnerHTML' src | grep -v '^src/ui/HtmlContent.tsx$')
if [ -n "$bad" ]; then
  echo "check:atomic failed. dangerouslySetInnerHTML outside src/ui/HtmlContent.tsx:"
  echo "$bad"
  exit 1
fi

echo "check:atomic ok"
