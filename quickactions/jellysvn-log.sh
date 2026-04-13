#!/bin/bash
# jellysvn-log.sh
# Shows recent SVN log entries for the selected folder as a macOS alert dialog.

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

SVN="/opt/homebrew/bin/svn"
FOLDER="$1"

if [ -z "$FOLDER" ]; then
    osascript -e 'display alert "JELLYSVN Log" message "No folder selected." as warning'
    exit 0
fi

if [ -f "$FOLDER" ]; then
    FOLDER="$(dirname "$FOLDER")"
fi

if [ ! -d "$FOLDER" ]; then
    osascript -e 'display alert "JELLYSVN Log" message "Path is not a directory." as warning'
    exit 0
fi

if [ ! -x "$SVN" ]; then
    SVN="$(which svn 2>/dev/null)"
    if [ -z "$SVN" ]; then
        osascript -e 'display alert "JELLYSVN Log" message "SVN not found. Install with: brew install svn" as warning'
        exit 0
    fi
fi

# Walk up directory tree to find SVN working copy root
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
    osascript -e 'display alert "JELLYSVN Log" message "Not an SVN working copy." as warning'
    exit 0
fi

# Progress notification
osascript -e "display notification \"Fetching log entries...\" with title \"🔄 JellySvn\" subtitle \"$(basename "$SVN_ROOT")\""

# Get last 10 log entries
LOG_OUTPUT=$("$SVN" log "$SVN_ROOT" --limit 10 --non-interactive --trust-server-cert 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    ERROR_MSG=$(echo "$LOG_OUTPUT" | tail -3 | cut -c1-200)
    osascript -e 'display alert "JELLYSVN Log - Error" message "'"$ERROR_MSG"'" as critical'
    exit 0
fi

# Parse log entries into a temp file for safe passing to osascript
TMPFILE=$(mktemp /tmp/jellysvn-log.XXXXXX)

while IFS= read -r line; do
    if echo "$line" | grep -qE "^r[0-9]+ \|"; then
        REV=$(echo "$line" | cut -d'|' -f1 | tr -d ' ')
        AUTHOR=$(echo "$line" | cut -d'|' -f2 | tr -d ' ')
        DATE=$(echo "$line" | cut -d'|' -f3 | cut -d' ' -f2)
        echo "${REV}  ${AUTHOR}  ${DATE}" >> "$TMPFILE"
    elif [ -n "$line" ] && ! echo "$line" | grep -qE "^-{5,}"; then
        MSG=$(echo "$line" | cut -c1-60)
        echo "  ${MSG}" >> "$TMPFILE"
    fi
done <<< "$LOG_OUTPUT"

if [ ! -s "$TMPFILE" ]; then
    echo "No log entries found." > "$TMPFILE"
fi

TITLE="JELLYSVN Log - $(basename "$SVN_ROOT")"

# Read temp file and display alert (do shell script preserves UTF-8)
osascript -e "set msg to do shell script \"cat '$TMPFILE'\"" -e "display alert \"$TITLE\" message msg"

rm -f "$TMPFILE"
