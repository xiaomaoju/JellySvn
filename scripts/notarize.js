// scripts/notarize.js
// Apple Notarization hook for electron-builder
// Required environment variables:
//   APPLE_ID          - Apple Developer account email
//   APPLE_APP_PASSWORD - App-specific password (appleid.apple.com > Security)
//   APPLE_TEAM_ID     - Developer Team ID (developer.apple.com > Membership)

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    // Skip notarization if credentials are not set
    if (!process.env.APPLE_ID || !process.env.APPLE_APP_PASSWORD || !process.env.APPLE_TEAM_ID) {
        console.log('  • Skipping notarization: APPLE_ID, APPLE_APP_PASSWORD, or APPLE_TEAM_ID not set');
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    const appPath = `${appOutDir}/${appName}.app`;

    console.log(`  • Notarizing ${appName}...`);

    await notarize({
        appPath,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
    });

    console.log(`  • Notarization complete`);
};
