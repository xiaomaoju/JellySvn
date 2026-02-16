#!/bin/bash
# install-quickactions.sh
# Installer script that creates macOS Quick Action (.workflow) bundles for JellySvn.
# These Quick Actions appear in Finder's right-click context menu under "Quick Actions".
#
# Usage: ./install-quickactions.sh
#
# The installer will:
# 1. Copy the shell scripts to ~/Library/Application Support/JellySvn/
# 2. Create .workflow bundles in ~/Library/Services/
# 3. Make all scripts executable

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICES_DIR="$HOME/Library/Services"
SUPPORT_DIR="$HOME/Library/Application Support/JellySvn"
SCRIPTS_DIR="$SUPPORT_DIR/scripts"

echo "========================================="
echo "  JellySvn Quick Actions Installer"
echo "========================================="
echo ""

# Create directories
echo "[1/4] Creating directories..."
mkdir -p "$SERVICES_DIR"
mkdir -p "$SCRIPTS_DIR"

# Copy shell scripts to Application Support
echo "[2/4] Installing shell scripts..."
for script in jellysvn-open.sh jellysvn-status.sh jellysvn-update.sh jellysvn-commit.sh jellysvn-cleanup.sh; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        cp "$SCRIPT_DIR/$script" "$SCRIPTS_DIR/$script"
        chmod +x "$SCRIPTS_DIR/$script"
        echo "  Installed: $script"
    else
        echo "  WARNING: $script not found in $SCRIPT_DIR"
    fi
done

# Function to create a workflow bundle
create_workflow() {
    local SERVICE_NAME="$1"
    local SCRIPT_NAME="$2"
    local DESCRIPTION="$3"

    local WORKFLOW_DIR="$SERVICES_DIR/${SERVICE_NAME}.workflow"
    local CONTENTS_DIR="$WORKFLOW_DIR/Contents"

    # Remove existing workflow if present
    if [ -d "$WORKFLOW_DIR" ]; then
        rm -rf "$WORKFLOW_DIR"
    fi

    mkdir -p "$CONTENTS_DIR"

    local SCRIPT_PATH="$SCRIPTS_DIR/$SCRIPT_NAME"

    # Create the document.wflow XML plist
    cat > "$CONTENTS_DIR/document.wflow" << 'PLIST_HEADER'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
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
				<key>AMKeywords</key>
				<array>
					<string>Run</string>
				</array>
				<key>AMName</key>
PLIST_HEADER

    # Insert the service name
    echo "				<string>Run Shell Script</string>" >> "$CONTENTS_DIR/document.wflow"

    cat >> "$CONTENTS_DIR/document.wflow" << 'PLIST_MID1'
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMRequiredResources</key>
				<array/>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
PLIST_MID1

    # Insert the shell command that calls our script
    # We need to XML-escape the path
    local ESCAPED_PATH
    ESCAPED_PATH=$(echo "$SCRIPT_PATH" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g')

    echo "					<string>for f in \"\$@\"; do" >> "$CONTENTS_DIR/document.wflow"
    echo "    \"${ESCAPED_PATH}\" \"\$f\"" >> "$CONTENTS_DIR/document.wflow"
    echo "done</string>" >> "$CONTENTS_DIR/document.wflow"

    cat >> "$CONTENTS_DIR/document.wflow" << 'PLIST_MID2'
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/bash</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>A1A1A1A1-B2B2-C3C3-D4D4-E5E5E5E5E5E5</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>OutputUUID</key>
				<string>F6F6F6F6-A7A7-B8B8-C9C9-D0D0D0D0D0D0</string>
				<key>UUID</key>
				<string>12345678-1234-1234-1234-123456789ABC</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key>
						<integer>0</integer>
						<key>name</key>
						<string>inputMethod</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>0</string>
					</dict>
					<key>1</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>source</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>1</string>
					</dict>
					<key>2</key>
					<dict>
						<key>default value</key>
						<false/>
						<key>name</key>
						<string>CheckedForUserDefaultShell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>2</string>
					</dict>
					<key>3</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>COMMAND_STRING</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>3</string>
					</dict>
					<key>4</key>
					<dict>
						<key>default value</key>
						<string>/bin/sh</string>
						<key>name</key>
						<string>shell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<integer>0</integer>
						<key>uuid</key>
						<string>4</string>
					</dict>
				</dict>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>529.000000:622.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByPath</key>
		<dict/>
		<key>applicationPaths</key>
		<array/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<integer>0</integer>
		<key>serviceApplicationGroupName</key>
		<string>Folder</string>
		<key>serviceApplicationPath</key>
		<string>/System/Library/CoreServices/Finder.app</string>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<integer>0</integer>
		<key>systemImageName</key>
		<string>NSActionTemplate</string>
		<key>useAutomaticInputType</key>
		<integer>0</integer>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
PLIST_MID2

    echo "  Created: ${SERVICE_NAME}.workflow"
}

# Create all workflow bundles
echo "[3/4] Creating Quick Action workflows..."
echo ""

create_workflow "Open in JellySvn"       "jellysvn-open.sh"    "Open selected folder in JellySvn"
create_workflow "JellySvn - SVN Status"  "jellysvn-status.sh"  "Show SVN status as notification"
create_workflow "JellySvn - SVN Update"  "jellysvn-update.sh"  "Run svn update on selected folder"
create_workflow "JellySvn - Commit"      "jellysvn-commit.sh"  "Open JellySvn commit view"
create_workflow "JellySvn - SVN Cleanup" "jellysvn-cleanup.sh" "Run svn cleanup on selected folder"

echo ""
echo "[4/4] Verifying installation..."

INSTALLED=0
FAILED=0
for wf in "Open in JellySvn" "JellySvn - SVN Status" "JellySvn - SVN Update" "JellySvn - Commit" "JellySvn - SVN Cleanup"; do
    if [ -f "$SERVICES_DIR/${wf}.workflow/Contents/document.wflow" ]; then
        INSTALLED=$((INSTALLED + 1))
    else
        echo "  FAILED: ${wf}.workflow"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "========================================="
echo "  Installation Complete!"
echo "========================================="
echo ""
echo "  Workflows installed: $INSTALLED"
[ "$FAILED" -gt 0 ] && echo "  Workflows failed:    $FAILED"
echo "  Location: $SERVICES_DIR"
echo "  Scripts:  $SCRIPTS_DIR"
echo ""
echo "  The Quick Actions should now appear when you"
echo "  right-click a folder in Finder under the"
echo "  'Quick Actions' submenu."
echo ""
echo "  If they do not appear immediately:"
echo "    1. Open System Settings > Privacy & Security > Extensions"
echo "    2. Click 'Finder Extensions' or 'Quick Actions'"
echo "    3. Enable the JellySvn actions"
echo "    4. Or try: killall Finder"
echo ""
echo "  To uninstall, run:"
echo "    rm -rf ~/Library/Services/Open\\ in\\ JellySvn.workflow"
echo "    rm -rf ~/Library/Services/JellySvn\\ -\\ SVN\\ Status.workflow"
echo "    rm -rf ~/Library/Services/JellySvn\\ -\\ SVN\\ Update.workflow"
echo "    rm -rf ~/Library/Services/JellySvn\\ -\\ Commit.workflow"
echo "    rm -rf ~/Library/Services/JellySvn\\ -\\ SVN\\ Cleanup.workflow"
echo "    rm -rf ~/Library/Application\\ Support/JellySvn/scripts/"
echo ""
