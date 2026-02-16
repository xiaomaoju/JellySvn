#!/bin/bash
# Recreate JellySvn Quick Action workflows with correct config

SERVICES_DIR="$HOME/Library/Services"
SCRIPTS_DIR="$HOME/Library/Application Support/JellySvn/scripts"

create_workflow() {
    local name="$1"
    local script="$2"
    local workflow_dir="$SERVICES_DIR/$name.workflow/Contents"

    rm -rf "$SERVICES_DIR/$name.workflow"
    mkdir -p "$workflow_dir"

    cat > "$workflow_dir/document.wflow" << 'PLIST_START'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>actions</key>
    <array>
        <dict>
            <key>action</key>
            <dict>
                <key>ActionBundlePath</key>
                <string>/System/Library/Automator/Run Shell Script.action</string>
                <key>ActionName</key>
                <string>Run Shell Script</string>
                <key>ActionParameters</key>
                <dict>
                    <key>CheckedForUserDefaultShell</key>
                    <true/>
                    <key>COMMAND_STRING</key>
PLIST_START

    # Insert the command string
    echo "                    <string>\"$SCRIPTS_DIR/$script\" \"\$@\"</string>" >> "$workflow_dir/document.wflow"

    cat >> "$workflow_dir/document.wflow" << 'PLIST_END'
                    <key>inputMethod</key>
                    <integer>1</integer>
                    <key>shell</key>
                    <string>/bin/bash</string>
                    <key>source</key>
                    <string></string>
                </dict>
                <key>AMAccepts</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Optional</key>
                    <true/>
                    <key>Types</key>
                    <array>
                        <string>com.apple.cocoa.string</string>
                    </array>
                </dict>
                <key>AMActionVersion</key>
                <string>2.0.3</string>
                <key>AMApplication</key>
                <array>
                    <string>Automator</string>
                </array>
                <key>AMCategory</key>
                <string>AMCategoryUtilities</string>
                <key>AMIconName</key>
                <string>Automator</string>
                <key>AMParameterProperties</key>
                <dict>
                    <key>CheckedForUserDefaultShell</key>
                    <dict/>
                    <key>COMMAND_STRING</key>
                    <dict/>
                    <key>inputMethod</key>
                    <dict/>
                    <key>shell</key>
                    <dict/>
                    <key>source</key>
                    <dict/>
                </dict>
                <key>AMProvides</key>
                <dict>
                    <key>Container</key>
                    <string>List</string>
                    <key>Types</key>
                    <array>
                        <string>com.apple.cocoa.string</string>
                    </array>
                </dict>
                <key>ActionKeywords</key>
                <array>
                    <string>Run</string>
                    <string>Shell</string>
                    <string>SVN</string>
                    <string>JellySvn</string>
                </array>
            </dict>
        </dict>
    </array>
    <key>connectors</key>
    <dict/>
    <key>serviceApplicationBundleID</key>
    <string>com.apple.finder</string>
    <key>serviceApplicationPath</key>
    <string>/System/Library/CoreServices/Finder.app</string>
    <key>serviceInputTypeIdentifier</key>
    <string>com.apple.Automator.fileSystemObject</string>
    <key>serviceProcessesInput</key>
    <integer>0</integer>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
</dict>
</plist>
PLIST_END

    plutil -lint "$workflow_dir/document.wflow" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "  [OK] $name"
    else
        echo "  [FAIL] $name"
        plutil -lint "$workflow_dir/document.wflow"
    fi
}

echo "=== Recreating JellySvn Quick Action Workflows ==="

create_workflow "Open in JellySvn" "jellysvn-open.sh"
create_workflow "JellySvn - SVN Status" "jellysvn-status.sh"
create_workflow "JellySvn - SVN Update" "jellysvn-update.sh"
create_workflow "JellySvn - Commit" "jellysvn-commit.sh"
create_workflow "JellySvn - SVN Cleanup" "jellysvn-cleanup.sh"

echo ""
echo "=== Done! Restarting Finder... ==="
killall Finder
echo "Workflows reinstalled. Check Finder right-click > Quick Actions or Services."
