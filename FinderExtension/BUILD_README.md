# JellySvn FinderSync Extension - Build Guide

## Overview
macOS FinderSync extension that provides SVN file status overlays and right-click context menu in Finder.

## Features
- **File Status Overlay**: Clean (green), Modified (orange), Added (blue), Conflict (red), Untracked (gray), Deleted (pink)
- **Right-click Menu**: SVN Status, Update, Commit, Revert, Cleanup, Log, Open in JellySvn
- **Sandbox Compatible**: Uses NSUserScriptTask for SVN operations

## Quick Build & Install

```bash
cd FinderExtension
./build.sh
```

## Manual Build

### Prerequisites
- Xcode 16+ with Command Line Tools
- Apple Development certificate (code signing required)
- xcodegen (`brew install xcodegen`)

### Steps
1. Generate Xcode project:
   ```bash
   xcodegen generate
   ```

2. Build:
   ```bash
   xcodebuild -project JellySvnHelper.xcodeproj \
       -scheme JellySvnHelper \
       -configuration Release \
       -derivedDataPath build \
       DEVELOPMENT_TEAM=L22GNGMAG4
   ```

3. Install:
   ```bash
   cp -R build/Build/Products/Release/JellySvnHelper.app /Applications/
   pluginkit -a /Applications/JellySvnHelper.app/Contents/PlugIns/JellySvnFinder.appex
   pluginkit -e use -i com.jellysvn.helper.finder-extension
   killall Finder
   open /Applications/JellySvnHelper.app
   ```

## Architecture

```
JellySvnHelper.app (Host App - menu bar helper)
  └── Contents/PlugIns/
       └── JellySvnFinder.appex (FinderSync Extension)
```

- **Host App**: Minimal menu bar app that hosts the FinderSync extension
- **Extension**: Sandboxed FinderSync that monitors SVN working copies
- **Scripts**: Shell scripts in `~/Library/Application Scripts/` for SVN operations (sandbox-compatible)

## Key Configuration
- **Team ID**: L22GNGMAG4
- **Extension Bundle ID**: com.jellysvn.helper.finder-extension
- **Extension Point**: com.apple.FinderSync
- **Sandbox**: Required (App Sandbox must be enabled)

## Troubleshooting
- Check extension status: `pluginkit -m -p com.apple.FinderSync`
- View logs: `log show --last 5m | grep -i jelly`
- Enable extension: `pluginkit -e use -i com.jellysvn.helper.finder-extension`
- System Settings > Privacy & Security > Extensions > Finder Extensions
