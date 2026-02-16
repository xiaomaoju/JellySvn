const { contextBridge, ipcRenderer } = require('electron');

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
});
