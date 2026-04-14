#!/bin/bash
# jellysvn-update.sh
# Runs svn update on the selected folder and shows result as a macOS alert dialog.

SVN="/opt/homebrew/bin/svn"
FOLDER="$1"

if [ -z "$FOLDER" ]; then
    osascript -e 'display alert "JELLYSVN Update" message "No folder selected." as warning'
    exit 0
fi

if [ -f "$FOLDER" ]; then
    FOLDER="$(dirname "$FOLDER")"
fi

if [ ! -d "$FOLDER" ]; then
    osascript -e "display alert \"JELLYSVN Update\" message \"Path is not a directory.\" as warning"
    exit 0
fi

if [ ! -x "$SVN" ]; then
    SVN="$(which svn 2>/dev/null)"
    if [ -z "$SVN" ]; then
        osascript -e 'display alert "JELLYSVN Update" message "SVN not found. Install with: brew install svn" as warning'
        exit 0
    fi
fi

find_svn_root() {
    local dir="$1"
    while [ "$dir" != "/" ]; do
        if [ -d "$dir/.svn" ]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    return 1
}

SVN_ROOT=$(find_svn_root "$FOLDER")
if [ -z "$SVN_ROOT" ]; then
    osascript -e "display alert \"JELLYSVN Update\" message \"Not an SVN working copy: $(basename "$FOLDER")\" as warning"
    exit 0
fi

# Progress notification
osascript -e "display notification \"Updating working copy...\" with title \"🔄 JellySvn\" subtitle \"$(basename "$FOLDER")\""

# Run svn update
UPDATE_OUTPUT=$("$SVN" update "$FOLDER" --non-interactive --trust-server-cert 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    ERROR_MSG=$(echo "$UPDATE_OUTPUT" | tail -3 | cut -c1-300)
    osascript -e "display alert \"JELLYSVN Update — Error\" message \"$ERROR_MSG\" as critical"
    exit 0
fi

REVISION=$(echo "$UPDATE_OUTPUT" | grep -oE "(revision|Revision) [0-9]+" | tail -1 | grep -oE "[0-9]+")
UPDATED_COUNT=$(echo "$UPDATE_OUTPUT" | grep -cE "^[ADUCGE] ")
CONFLICT_COUNT=$(echo "$UPDATE_OUTPUT" | grep -cE "^C ")
MERGED_COUNT=$(echo "$UPDATE_OUTPUT" | grep -cE "^G ")

SUMMARY="Revision: ${REVISION:-unknown}\n"
[ "$UPDATED_COUNT" -gt 0 ] && SUMMARY="${SUMMARY}Updated: $UPDATED_COUNT files\n"
[ "$MERGED_COUNT" -gt 0 ] && SUMMARY="${SUMMARY}Merged: $MERGED_COUNT\n"
[ "$CONFLICT_COUNT" -gt 0 ] && SUMMARY="${SUMMARY}CONFLICTS: $CONFLICT_COUNT\n"

if [ "$UPDATED_COUNT" -eq 0 ] && [ "$MERGED_COUNT" -eq 0 ] && [ "$CONFLICT_COUNT" -eq 0 ]; then
    SUMMARY="${SUMMARY}Already up to date."
fi

osascript -e "display notification \"$SUMMARY\" with title \"✅ SVN Update Complete\" subtitle \"$(basename "$FOLDER") — Rev ${REVISION:-?}\""

# Forward update report to running JellySvn app (if installed)
APP_PATH=""
for candidate in "/Applications/JellySvn.app" "$HOME/Applications/JellySvn.app"; do
    [ -d "$candidate" ] && APP_PATH="$candidate" && break
done
if [ -n "$APP_PATH" ]; then
    TMP_QA=$(mktemp /tmp/jellysvn-qa-update.XXXXXX)
    {
        echo "Working copy: $SVN_ROOT"
        echo "Revision: ${REVISION:-unknown}"
        echo "Updated: $UPDATED_COUNT  Merged: $MERGED_COUNT  Conflicts: $CONFLICT_COUNT"
        echo "---"
        echo "$UPDATE_OUTPUT"
    } > "$TMP_QA"
    open -g -a "$APP_PATH" --args "$SVN_ROOT" --qa update --qa-msg-file "$TMP_QA"
    ( sleep 5 && rm -f "$TMP_QA" ) &
fi
