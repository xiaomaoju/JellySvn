const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Projects
    loadProjects: () => ipcRenderer.invoke('load-projects'),
    saveProject: (project) => ipcRenderer.invoke('save-project', project),
    deleteProject: (path) => ipcRenderer.invoke('delete-project', path),

    // Auth
    loadAuth: () => ipcRenderer.invoke('load-auth'),
    saveAuth: (creds) => ipcRenderer.invoke('save-auth', creds),
    deleteAuth: (urlKey) => ipcRenderer.invoke('delete-auth', urlKey),

    // SVN
    runSvn: (command, cwd, url) => ipcRenderer.invoke('run-svn', command, cwd, url),
    onSvnOutput: (callback) => ipcRenderer.on('svn-output', (_event, payload) => callback(payload)),

    // File system
    browseFolder: () => ipcRenderer.invoke('browse-folder'),
    validateRepo: (path) => ipcRenderer.invoke('validate-repo', path),
    deleteFile: (filePath, cwd) => ipcRenderer.invoke('delete-file', filePath, cwd),
    listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
    searchFiles: (searchPath, query, searchType) => ipcRenderer.invoke('search-files', searchPath, query, searchType),

    // Settings
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

    // File dialogs
    saveFileDialog: (defaultName) => ipcRenderer.invoke('save-file-dialog', defaultName),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

    // File watcher
    watchDirectory: (dirPath) => ipcRenderer.invoke('watch-directory', dirPath),
    unwatchDirectory: () => ipcRenderer.invoke('unwatch-directory'),
    onFileChanged: (callback) => ipcRenderer.on('file-changed', (_event, payload) => callback(payload)),

    // File copy (for drag & drop)
    copyFile: (srcPath, destPath) => ipcRenderer.invoke('copy-file', srcPath, destPath),
    // Resolve absolute path from a dropped File (webUtils works under
    // contextIsolation; File.path was removed in Electron 32+).
    getDroppedFilePath: (file) => {
        try {
            return webUtils.getPathForFile(file);
        } catch (e) {
            return '';
        }
    },

    // Reveal in file manager (Finder / Explorer)
    revealInFileManager: (filePath) => ipcRenderer.invoke('reveal-in-file-manager', filePath),

    // External diff tool
    openExternalDiff: (options) => ipcRenderer.invoke('open-external-diff', options),

    // Command-line open args (from Quick Actions / Finder right-click)
    onOpenWithArgs: (callback) => {
        ipcRenderer.removeAllListeners('open-with-args');
        ipcRenderer.on('open-with-args', (_event, args) => callback(args));
    },
    rendererReady: () => ipcRenderer.invoke('renderer-ready'),

    // Placeholder management
    placeholderScan: (dirPath) => ipcRenderer.invoke('placeholder:scan', dirPath),
    placeholderDownload: (opts) => ipcRenderer.invoke('placeholder:download', opts),
    placeholderTruncate: (opts) => ipcRenderer.invoke('placeholder:truncate', opts),
    placeholderSyncStructure: (opts) => ipcRenderer.invoke('placeholder:syncStructure', opts),
    placeholderCheckout: (opts) => ipcRenderer.invoke('placeholder:checkoutAsPlaceholder', opts),
    placeholderGetRemoteListing: (dir) => ipcRenderer.invoke('placeholder:getRemoteListing', dir),
    placeholderRefreshRemoteListing: (dir) => ipcRenderer.invoke('placeholder:refreshRemoteListing', dir),
    placeholderDownloadFolder: (opts) => ipcRenderer.invoke('placeholder:downloadFolder', opts),
    placeholderDownloadFile: (opts) => ipcRenderer.invoke('placeholder:downloadFile', opts),
    placeholderExcludeFile: (opts) => ipcRenderer.invoke('placeholder:excludeFile', opts),
    placeholderTruncateFolder: (opts) => ipcRenderer.invoke('placeholder:truncateFolder', opts),
    onPlaceholderProgress: (callback) => {
        ipcRenderer.removeAllListeners('placeholder:progress');
        ipcRenderer.on('placeholder:progress', (_event, payload) => callback(payload));
    },
});
