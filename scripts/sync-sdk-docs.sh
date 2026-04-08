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

# Tracks content hashes of reference files across runs so we can skip
# unchanged ones in the prompt. Format: "<sha256>  <sdk-relative-path>"
SYNC_STATE="$DOCS_REPO/.sdk-sync-state"
[[ -f "$SYNC_STATE" ]] || touch "$SYNC_STATE"

# Stores the previous rendered content of each reference file so we can show
# a diff instead of the full file. Filenames: <path-with-slashes-as-underscores>.prev
STATE_DIR="$DOCS_REPO/.sdk-sync-state.d"
mkdir -p "$STATE_DIR"

CHANGED=()
REMOVED=()

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
        -e 's|href="/package-selection[^"]*"|href="/sdk/overview"|g' \
        -e 's|href="/quickstart[^"]*"|href="/sdk/tutorials/first-app"|g' \
        -e 's|href="/browser-apps[^"]*"|href="/sdk/overview"|g' \
        -e 's|href="/operations/compatibility[^"]*"|href="/sdk/operations/compatibility"|g' \
        -e 's|href="/operations/troubleshooting[^"]*"|href="/sdk/operations/troubleshooting"|g' \
        -e 's|](/tutorials/|](/sdk/tutorials/|g' \
        -e 's|](/guides/|](/sdk/guides/|g' \
        -e 's|](/reference/create-elata-demo|](/sdk/create-elata-demo|g' \
        -e 's|](/reference/eeg-web-ble|](/sdk/eeg-web-ble/getting-started|g' \
        -e 's|](/reference/eeg-web|](/sdk/eeg-web/getting-started|g' \
        -e 's|](/reference/rppg-web|](/sdk/rppg-web/getting-started|g' \
        -e 's|](/package-selection)|](/sdk/overview)|g' \
        -e 's|](/quickstart)|](/sdk/tutorials/first-app)|g' \
        -e 's|](/browser-apps)|](/sdk/overview)|g' \
        -e 's|](/operations/compatibility)|](/sdk/operations/compatibility)|g' \
        -e 's|](/operations/troubleshooting)|](/sdk/operations/troubleshooting)|g'
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

# Remove files in $dst_dir whose basenames no longer exist in $src_dir.
# Only touches .mdx files.
remove_stale_in_dir() {
    local src_dir="$1"
    local dst_dir="$2"
    local label_prefix="$3"
    [[ -d "$dst_dir" ]] || return 0
    for dst_file in "$dst_dir"/*.mdx; do
        [[ -f "$dst_file" ]] || continue
        local filename
        filename="$(basename "$dst_file")"
        if [[ ! -f "$src_dir/$filename" ]]; then
            rm "$dst_file"
            REMOVED+=("$label_prefix/$filename")
        fi
    done
}

# Returns the stored hash for a given SDK-relative path, or empty string.
get_stored_hash() {
    grep -F "  $1" "$SYNC_STATE" 2>/dev/null | awk '{print $1}' || true
}

# Upserts the hash for a given SDK-relative path in the state file.
set_stored_hash() {
    local rel="$1" hash="$2"
    local tmp
    tmp="$(mktemp)"
    grep -vF "  $rel" "$SYNC_STATE" > "$tmp" 2>/dev/null || true
    echo "$hash  $rel" >> "$tmp"
    mv "$tmp" "$SYNC_STATE"
}

# Returns the stored rendered content for a given SDK-relative path, or empty string.
get_stored_content() {
    local key="${1//\//_}"
    local f="$STATE_DIR/$key.prev"
    [[ -f "$f" ]] && cat "$f" || true
}

# Saves the rendered content for a given SDK-relative path.
set_stored_content() {
    local key="${1//\//_}"
    printf '%s' "$2" > "$STATE_DIR/$key.prev"
}

# ---------------------------------------------------------------------------
# Tutorials — remove stale, then copy all
# ---------------------------------------------------------------------------

remove_stale_in_dir "$SDK_DOCS/tutorials" "$DOCS_REPO/sdk/tutorials" "sdk/tutorials"

for src in "$SDK_DOCS/tutorials/"*.mdx; do
    [[ -f "$src" ]] || continue
    filename="$(basename "$src")"
    copy_file "$src" "$DOCS_REPO/sdk/tutorials/$filename" "sdk/tutorials/$filename"
done

# ---------------------------------------------------------------------------
# Guides — remove stale SDK-managed files, then copy
# SDK-managed guides are a named subset; others in sdk/guides/ are repo-only.
# ---------------------------------------------------------------------------

SDK_GUIDES=("eeg-browser.mdx" "rppg-browser.mdx" "web-bluetooth.mdx" "federated-learning.mdx")

for g in "${SDK_GUIDES[@]}"; do
    src="$SDK_DOCS/guides/$g"
    dst="$DOCS_REPO/sdk/guides/$g"
    if [[ ! -f "$src" && -f "$dst" ]]; then
        rm "$dst"
        REMOVED+=("sdk/guides/$g")
    fi
    [[ -f "$src" ]] && copy_file "$src" "$dst" "sdk/guides/$g"
done

# ---------------------------------------------------------------------------
# create-elata-demo reference — 1:1 copy
# ---------------------------------------------------------------------------

src="$SDK_DOCS/reference/create-elata-demo.mdx"
[[ -f "$src" ]] && copy_file "$src" "$DOCS_REPO/sdk/create-elata-demo.mdx" "sdk/create-elata-demo.mdx"

# ---------------------------------------------------------------------------
# Operations pages — remove stale, then copy all
# ---------------------------------------------------------------------------

remove_stale_in_dir "$SDK_DOCS/operations" "$DOCS_REPO/sdk/operations" "sdk/operations"

for src in "$SDK_DOCS/operations/"*.mdx; do
    [[ -f "$src" ]] || continue
    filename="$(basename "$src")"
    copy_file "$src" "$DOCS_REPO/sdk/operations/$filename" "sdk/operations/$filename"
done

# ---------------------------------------------------------------------------
# sdk/overview.mdx — sync package version badges from SDK package.json files
# All packages are versioned in lockstep; we read from eeg-web as the source.
# ---------------------------------------------------------------------------

_sdk_ver="$(grep -m1 '"version"' "$SDK_REPO/packages/eeg-web/package.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
_overview="$DOCS_REPO/sdk/overview.mdx"

if [[ -f "$_overview" && -n "$_sdk_ver" ]]; then
    _before="$(cat "$_overview")"
    _after="$(sed -E "s/(@elata-biosciences\/(eeg-web|eeg-web-ble|rppg-web|create-elata-demo)[^\|]*\|[[:space:]]*)[0-9]+\.[0-9]+\.[0-9]+/\1$_sdk_ver/g" <<< "$_before")"
    if [[ "$_before" != "$_after" ]]; then
        echo "$_after" > "$_overview"
        CHANGED+=("sdk/overview.mdx (version → $_sdk_ver)")
    fi
fi

# ---------------------------------------------------------------------------
# Print status to stderr so it doesn't pollute the Claude prompt
# ---------------------------------------------------------------------------

{
    echo ""
    if [[ ${#CHANGED[@]} -gt 0 || ${#REMOVED[@]} -gt 0 ]]; then
        if [[ ${#CHANGED[@]} -gt 0 ]]; then
            echo "Auto-updated:"
            for f in "${CHANGED[@]}"; do echo "  $f"; done
        fi
        if [[ ${#REMOVED[@]} -gt 0 ]]; then
            echo "Removed (no longer in SDK):"
            for f in "${REMOVED[@]}"; do echo "  $f"; done
        fi
    else
        echo "No file changes (already up to date)."
    fi
    echo ""
} >&2

# ---------------------------------------------------------------------------
# Print Claude prompt to stdout — copy-paste this directly
# ---------------------------------------------------------------------------

REFERENCE_FILES=(
    "reference/eeg-web.mdx:sdk/eeg-web/getting-started.mdx"
    "reference/eeg-web-ble.mdx:sdk/eeg-web-ble/getting-started.mdx"
    "reference/rppg-web.mdx:sdk/rppg-web/getting-started.mdx"
)

cat <<'PROMPT_HEADER'
Here is my SDK docs sync report. The script has already copied tutorials, guides, operations pages, and the create-elata-demo reference page automatically. Please:

1. Review any changed SDK reference files below and merge updates into the correct sub-pages in this repo (the SDK's single reference file maps to multiple sub-pages here).
2. Check the nav gap report at the bottom and add any missing pages to docs.json if needed.

## Mintlify rules — follow these before finishing

This is a Mintlify docs site. Violating these will cause broken pages after deploy:

- **Every page listed in `docs.json` must have a corresponding `.mdx` file on disk.** If you add a page to the nav, create the file. If the file doesn't exist yet, either create a stub or leave it out of the nav.
- **Every internal link in an `.mdx` file must resolve to a page that exists in `docs.json`.** The SDK source uses paths like `/quickstart`, `/browser-apps`, and `/operations/*` that do not exist in this repo — the sync script rewrites the known ones, but double-check any link that doesn't start with `/sdk/` before saving.
- **Do not invent new top-level paths.** All SDK content lives under `sdk/`. If a concept from the SDK source has no equivalent page here, link to the closest existing page (e.g. `sdk/overview`) rather than a path that doesn't exist.
- **File format is `.mdx`, not `.md`.** All files are already `.mdx`; keep it that way.

---

PROMPT_HEADER

# Auto-updated/removed section
if [[ ${#CHANGED[@]} -gt 0 || ${#REMOVED[@]} -gt 0 ]]; then
    echo "## Files changed automatically by the sync script"
    echo ""
    for f in "${CHANGED[@]+"${CHANGED[@]}"}"; do echo "- updated: \`$f\`"; done
    for f in "${REMOVED[@]+"${REMOVED[@]}"}"; do echo "- removed: \`$f\`"; done
    echo ""
else
    echo "## Files changed automatically"
    echo ""
    echo "_(none — already up to date)_"
    echo ""
fi

echo "---"
echo ""
echo "## SDK reference files"
echo ""
echo "These map to multiple sub-pages in this repo and are not overwritten automatically."
echo ""

for entry in "${REFERENCE_FILES[@]}"; do
    sdk_rel="${entry%%:*}"
    docs_rel="${entry##*:}"
    src="$SDK_DOCS/$sdk_rel"
    docs_dir="$DOCS_REPO/$(dirname "$docs_rel")"

    # List sibling sub-pages in the heading
    siblings=""
    if [[ -d "$docs_dir" ]]; then
        siblings="$(ls "$docs_dir"/*.mdx 2>/dev/null | xargs -n1 basename | tr '\n' ' ' | sed 's/ $//')"
    fi
    if [[ -n "$siblings" ]]; then
        echo "### \`$sdk_rel\` → \`$(dirname "$docs_rel")/\` ($siblings)"
    else
        echo "### \`$sdk_rel\` → \`$docs_rel\` (and sibling pages)"
    fi
    echo ""

    if [[ ! -f "$src" ]]; then
        echo "_(not found in SDK — may have been removed)_"
        echo ""
        continue
    fi

    new_content="$(rewrite_links < "$src")"
    new_hash="$(echo "$new_content" | sha256sum | cut -d' ' -f1)"
    old_hash="$(get_stored_hash "$sdk_rel")"
    old_content="$(get_stored_content "$sdk_rel")"

    set_stored_hash "$sdk_rel" "$new_hash"
    set_stored_content "$sdk_rel" "$new_content"

    if [[ -n "$old_hash" && "$new_hash" == "$old_hash" ]]; then
        echo "_(unchanged since last sync — no action needed)_"
        echo ""
        continue
    fi

    if [[ -n "$old_hash" && -n "$old_content" ]]; then
        echo "_Changed since last sync — diff below. Merge updates into the relevant sub-pages._"
        echo ""
        echo '```diff'
        diff -u <(echo "$old_content") <(echo "$new_content") | tail -n +3 || true
        echo '```'
    else
        echo "_First sync — review and merge into sub-pages if needed._"
        echo ""
        echo '```mdx'
        echo "$new_content"
        echo '```'
    fi
    echo ""
done

# Warn about reference files in the SDK that aren't in REFERENCE_FILES.
_tracked_refs=()
for entry in "${REFERENCE_FILES[@]}"; do
    _tracked_refs+=("${entry%%:*}")
done

_untracked_refs=()
for f in "$SDK_DOCS/reference/"*.mdx; do
    [[ -f "$f" ]] || continue
    rel="reference/$(basename "$f")"
    # create-elata-demo is handled by the auto-copy section, not REFERENCE_FILES
    [[ "$rel" == "reference/create-elata-demo.mdx" ]] && continue
    _found=0
    for t in "${_tracked_refs[@]}"; do
        [[ "$t" == "$rel" ]] && _found=1 && break
    done
    [[ "$_found" -eq 0 ]] && _untracked_refs+=("$rel")
done

if [[ ${#_untracked_refs[@]} -gt 0 ]]; then
    echo "---"
    echo ""
    echo "> [!WARNING]"
    echo "> **Untracked SDK reference files** — these exist in the SDK but are not in"
    echo "> \`REFERENCE_FILES\` in the sync script. Add them to the script and create"
    echo "> sub-pages in this repo before the next sync."
    echo ">"
    for r in "${_untracked_refs[@]}"; do echo "> - \`$r\`"; done
    echo ""
fi

echo "---"
echo ""
echo "## Nav gap report"
echo ""
echo "SDK nav pages with no equivalent in this repo's Biometric SDKs tab:"
echo ""

# Extract all page paths from the SDK docs.json using grep.
# Matches known path patterns; skips maintainers, index, and root-level
# navigation pages that intentionally have no local equivalent.
_sdk_pages=$(grep -oE \
    '"(tutorials|guides|operations|reference)/[^"]*"|"(index|quickstart|browser-apps|package-selection)"' \
    "$SDK_DOCS/docs.json" | tr -d '"')

_gaps=()
while IFS= read -r page; do
    [[ -z "$page" ]] && continue

    # Determine expected local path (empty = skip)
    case "$page" in
        tutorials/*)  _local="sdk/$page" ;;
        guides/*)     _local="sdk/$page" ;;
        operations/*) _local="sdk/$page" ;;
        reference/create-elata-demo*) _local="sdk/create-elata-demo" ;;
        reference/eeg-web-ble*)       _local="sdk/eeg-web-ble/getting-started" ;;
        reference/eeg-web*)           _local="sdk/eeg-web/getting-started" ;;
        reference/rppg-web*)          _local="sdk/rppg-web/getting-started" ;;
        *)            continue ;;  # root-level SDK pages (index, quickstart, etc.) — skip
    esac

    grep -qF "\"$_local\"" "$DOCS_REPO/docs.json" || _gaps+=("$page → \`$_local\`")
done <<< "$_sdk_pages"

if [[ ${#_gaps[@]} -gt 0 ]]; then
    for _gap in "${_gaps[@]}"; do echo "- $_gap"; done
else
    echo "_(none — all SDK nav pages are accounted for)_"
fi

echo ""
