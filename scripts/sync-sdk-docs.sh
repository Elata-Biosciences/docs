#!/usr/bin/env bash
# sync-sdk-docs.sh
#
# Copies automatable content from the SDK repo's external/docs-site into this
# docs repo, rewrites internal links, and prints a Claude prompt to stdout
# with everything needed to handle the rest manually.
#
# Usage:
#   ./scripts/sync-sdk-docs.sh [path/to/elata-bio-sdk]
#
# Defaults to ../elata-bio-sdk relative to this repo.

set -euo pipefail

DOCS_REPO="$(cd "$(dirname "$0")/.." && pwd)"
SDK_REPO="${1:-$(cd "$DOCS_REPO/../elata-bio-sdk" && pwd)}"
SDK_DOCS="$SDK_REPO/external/docs-site"

if [[ ! -d "$SDK_DOCS" ]]; then
    echo "ERROR: SDK docs not found at $SDK_DOCS" >&2
    echo "Usage: $0 [path/to/elata-bio-sdk]" >&2
    exit 1
fi

CHANGED=()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

rewrite_links() {
    sed \
        -e 's|href="/tutorials/|href="/sdk/tutorials/|g' \
        -e 's|href="/guides/|href="/sdk/guides/|g' \
        -e 's|href="/reference/create-elata-demo|href="/sdk/create-elata-demo|g' \
        -e 's|href="/reference/eeg-web-ble|href="/sdk/eeg-web-ble/getting-started|g' \
        -e 's|href="/reference/eeg-web|href="/sdk/eeg-web/getting-started|g' \
        -e 's|href="/reference/rppg-web|href="/sdk/rppg-web/getting-started|g' \
        -e 's|href="/package-selection|href="/sdk/overview|g' \
        -e 's|href="/quickstart|href="/sdk/tutorials/first-app|g' \
        -e 's|](/tutorials/|](/sdk/tutorials/|g' \
        -e 's|](/guides/|](/sdk/guides/|g' \
        -e 's|](/reference/create-elata-demo|](/sdk/create-elata-demo|g' \
        -e 's|](/reference/eeg-web-ble|](/sdk/eeg-web-ble/getting-started|g' \
        -e 's|](/reference/eeg-web|](/sdk/eeg-web/getting-started|g' \
        -e 's|](/reference/rppg-web|](/sdk/rppg-web/getting-started|g'
}

copy_file() {
    local src="$1"
    local dst="$2"
    local label="$3"

    mkdir -p "$(dirname "$dst")"

    local dst_content=""
    [[ -f "$dst" ]] && dst_content="$(cat "$dst")"
    local new_content
    new_content="$(rewrite_links < "$src")"

    if [[ "$dst_content" == "$new_content" ]]; then
        return
    fi

    echo "$new_content" > "$dst"
    CHANGED+=("$label")
}

# ---------------------------------------------------------------------------
# Tutorials — 1:1 copy with path rewriting
# ---------------------------------------------------------------------------

for src in "$SDK_DOCS/tutorials/"*.mdx; do
    filename="$(basename "$src")"
    copy_file "$src" "$DOCS_REPO/sdk/tutorials/$filename" "sdk/tutorials/$filename"
done

# ---------------------------------------------------------------------------
# Guides — copy new or updated files
# ---------------------------------------------------------------------------

declare -A GUIDE_MAP=(
    ["eeg-browser.mdx"]="sdk/guides/eeg-browser.mdx"
    ["rppg-browser.mdx"]="sdk/guides/rppg-browser.mdx"
    ["web-bluetooth.mdx"]="sdk/guides/web-bluetooth.mdx"
    ["federated-learning.mdx"]="sdk/guides/federated-learning.mdx"
)

for sdk_name in "${!GUIDE_MAP[@]}"; do
    src="$SDK_DOCS/guides/$sdk_name"
    dst_rel="${GUIDE_MAP[$sdk_name]}"
    [[ -f "$src" ]] && copy_file "$src" "$DOCS_REPO/$dst_rel" "$dst_rel"
done

# ---------------------------------------------------------------------------
# create-elata-demo reference — 1:1 copy
# ---------------------------------------------------------------------------

src="$SDK_DOCS/reference/create-elata-demo.mdx"
[[ -f "$src" ]] && copy_file "$src" "$DOCS_REPO/sdk/create-elata-demo.mdx" "sdk/create-elata-demo.mdx"

# ---------------------------------------------------------------------------
# Print status to stderr so it doesn't pollute the Claude prompt
# ---------------------------------------------------------------------------

if [[ ${#CHANGED[@]} -gt 0 ]]; then
    echo "" >&2
    echo "Auto-updated:" >&2
    for f in "${CHANGED[@]}"; do echo "  $f" >&2; done
else
    echo "" >&2
    echo "No file changes (already up to date)." >&2
fi
echo "" >&2

# ---------------------------------------------------------------------------
# Print Claude prompt to stdout — copy-paste this directly
# ---------------------------------------------------------------------------

REFERENCE_FILES=(
    "reference/eeg-web.mdx:sdk/eeg-web/getting-started.mdx"
    "reference/eeg-web-ble.mdx:sdk/eeg-web-ble/getting-started.mdx"
    "reference/rppg-web.mdx:sdk/rppg-web/getting-started.mdx"
)

cat <<'PROMPT_HEADER'
Here is my SDK docs sync report. The script has already copied tutorials, guides, and the create-elata-demo reference page automatically. Please:

1. Review the SDK reference files below and merge any updates into the correct sub-pages in this repo (the SDK's single reference file maps to multiple sub-pages here).
2. Check if any new pages in the SDK's docs.json navigation are missing from this repo's docs.json under the Biometric SDKs tab, and add them if so.

---

PROMPT_HEADER

if [[ ${#CHANGED[@]} -gt 0 ]]; then
    echo "## Files updated automatically by the sync script"
    echo ""
    for f in "${CHANGED[@]}"; do echo "- $f"; done
    echo ""
else
    echo "## Files updated automatically"
    echo ""
    echo "_(none — already up to date)_"
    echo ""
fi

echo "---"
echo ""
echo "## SDK reference files that need manual review"
echo ""
echo "These map to multiple sub-pages in this repo, so they were not overwritten automatically."
echo ""

for entry in "${REFERENCE_FILES[@]}"; do
    sdk_rel="${entry%%:*}"
    docs_rel="${entry##*:}"
    src="$SDK_DOCS/$sdk_rel"

    echo "### \`$sdk_rel\` → \`$docs_rel\` (and sibling pages)"
    echo ""
    if [[ -f "$src" ]]; then
        echo '```'
        cat "$src"
        echo '```'
    else
        echo "_(not found in SDK)_"
    fi
    echo ""
done

echo "---"
echo ""
echo "## SDK docs.json (check for new pages)"
echo ""
echo '```json'
cat "$SDK_DOCS/docs.json"
echo '```'
