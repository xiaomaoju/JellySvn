#!/bin/bash
# Recreate JellySvn Quick Action workflows matching exact Automator format
# Includes all required fields: arguments, UUID, InputUUID, OutputUUID, nibPath, etc.

SERVICES_DIR="$HOME/Library/Services"
SCRIPTS_DIR="$HOME/Library/Application Support/JellySvn/scripts"

create_workflow() {
    local name="$1"
    local script="$2"
    local workflow_dir="$SERVICES_DIR/$name.workflow/Contents"

    # Generate unique UUIDs for this workflow
    local ACTION_UUID=$(uuidgen)
    local INPUT_UUID=$(uuidgen)
    local OUTPUT_UUID=$(uuidgen)

    # Build the command string
    local CMD_STRING="\"$SCRIPTS_DIR/$script\" \"\$@\""

    rm -rf "$SERVICES_DIR/$name.workflow"
    mkdir -p "$workflow_dir"

    # Write the plist using PlistBuddy for guaranteed correctness
    local PLIST="$workflow_dir/document.wflow"

    /usr/libexec/PlistBuddy -c "Add :AMApplicationBuild string 512" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :AMApplicationVersion string 2.10" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :AMDocumentVersion string 2" "$PLIST"

    # actions array
    /usr/libexec/PlistBuddy -c "Add :actions array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0 dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action dict" "$PLIST"

    # Action bundle info
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionBundlePath string /System/Library/Automator/Run Shell Script.action" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionName string 'Run Shell Script'" "$PLIST"

    # ActionParameters
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionParameters dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionParameters:CheckedForUserDefaultShell bool true" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionParameters:COMMAND_STRING string $CMD_STRING" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionParameters:inputMethod integer 1" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionParameters:shell string /bin/zsh" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:ActionParameters:source string ''" "$PLIST"

    # AMAccepts
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMAccepts dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMAccepts:Container string List" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMAccepts:Optional bool true" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMAccepts:Types array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMAccepts:Types:0 string com.apple.cocoa.string" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMActionVersion string 2.0.3" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMApplication array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMApplication:0 string Automator" "$PLIST"

    # AMParameterProperties
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMParameterProperties dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMParameterProperties:CheckedForUserDefaultShell dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMParameterProperties:COMMAND_STRING dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMParameterProperties:inputMethod dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMParameterProperties:shell dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMParameterProperties:source dict" "$PLIST"

    # AMProvides
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMProvides dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMProvides:Container string List" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMProvides:Types array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:AMProvides:Types:0 string com.apple.cocoa.string" "$PLIST"

    # arguments (critical for Automator to parse)
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments dict" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:0 dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:0:default\ value integer 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:0:name string inputMethod" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:0:required string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:0:type string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:0:uuid string 0" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:1 dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:1:default\ value bool false" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:1:name string CheckedForUserDefaultShell" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:1:required string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:1:type string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:1:uuid string 1" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:2 dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:2:default\ value string ''" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:2:name string source" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:2:required string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:2:type string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:2:uuid string 2" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:3 dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:3:default\ value string ''" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:3:name string COMMAND_STRING" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:3:required string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:3:type string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:3:uuid string 3" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:4 dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:4:default\ value string /bin/sh" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:4:name string shell" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:4:required string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:4:type string 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:arguments:4:uuid string 4" "$PLIST"

    # Bundle/Class info
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:BundleIdentifier string com.apple.RunShellScript" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:CFBundleVersion string 2.0.3" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:CanShowSelectedItemsWhenRun bool false" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:CanShowWhenRun bool true" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Category array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Category:0 string AMCategoryUtilities" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Class\ Name string RunShellScriptAction" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:InputUUID string $INPUT_UUID" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Keywords array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Keywords:0 string Shell" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Keywords:1 string Script" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Keywords:2 string Command" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Keywords:3 string Run" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:Keywords:4 string Unix" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:location string 309.000000:361.000000" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:nibPath string /System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:OutputUUID string $OUTPUT_UUID" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:UnlocalizedApplications array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:UnlocalizedApplications:0 string Automator" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :actions:0:action:UUID string $ACTION_UUID" "$PLIST"

    # isViewVisible at the outer action dict level
    /usr/libexec/PlistBuddy -c "Add :actions:0:action:isViewVisible integer 1" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :actions:0:isViewVisible integer 1" "$PLIST"

    # connectors
    /usr/libexec/PlistBuddy -c "Add :connectors dict" "$PLIST"

    # workflowMetaData — exact match with SnailSVN
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:applicationBundleID string com.apple.finder" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:applicationBundleIDsByPath dict" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:applicationBundleIDsByPath:/System/Library/CoreServices/Finder.app string com.apple.finder" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:applicationPath string /System/Library/CoreServices/Finder.app" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:applicationPaths array" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:applicationPaths:0 string /System/Library/CoreServices/Finder.app" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:inputTypeIdentifier string com.apple.Automator.fileSystemObject" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:outputTypeIdentifier string com.apple.Automator.nothing" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:presentationMode integer 15" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:processesInput integer 0" "$PLIST"

    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:serviceApplicationBundleID string com.apple.finder" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:serviceApplicationPath string /System/Library/CoreServices/Finder.app" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:serviceInputTypeIdentifier string com.apple.Automator.fileSystemObject" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:serviceOutputTypeIdentifier string com.apple.Automator.nothing" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:serviceProcessesInput integer 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:systemImageName string NSActionTemplate" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:useAutomaticInputType integer 0" "$PLIST"
    /usr/libexec/PlistBuddy -c "Add :workflowMetaData:workflowTypeIdentifier string com.apple.Automator.servicesMenu" "$PLIST"

    # Validate
    if plutil -lint "$PLIST" > /dev/null 2>&1; then
        echo "  [OK] $name"
    else
        echo "  [FAIL] $name"
        plutil -lint "$PLIST"
    fi
}

echo "=== Recreating JellySvn Quick Action Workflows (v2) ==="
echo "Using PlistBuddy for exact Automator-compatible format"
echo ""

create_workflow "Open in JellySvn" "jellysvn-open.sh"
create_workflow "JellySvn - SVN Status" "jellysvn-status.sh"
create_workflow "JellySvn - SVN Update" "jellysvn-update.sh"
create_workflow "JellySvn - Commit" "jellysvn-commit.sh"
create_workflow "JellySvn - SVN Cleanup" "jellysvn-cleanup.sh"
create_workflow "JellySvn - SVN Log" "jellysvn-log.sh"

echo ""
echo "=== Flushing pbs cache ==="
/System/Library/CoreServices/pbs -flush 2>/dev/null
/System/Library/CoreServices/pbs -update 2>/dev/null

echo "=== Restarting Finder ==="
killall Finder

echo ""
echo "Done! Check Finder > right-click > Services or Quick Actions."
