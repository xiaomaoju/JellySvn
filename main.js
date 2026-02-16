const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Use app.getPath('userData') for writable user data in production
function getDataDir() {
    return app.getPath('userData');
}

let AUTH_FILE;
let PROJECTS_FILE;
let SETTINGS_FILE;
let mainWindow;
let fileWatcher = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 12, y: 10 },
        backgroundColor: '#0f0f23',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development (uncomment to enable)
    // if (!app.isPackaged) {
    //     mainWindow.webContents.openDevTools({ mode: 'detach' });
    // }
}

app.whenReady().then(() => {
    const dataDir = getDataDir();
    AUTH_FILE = path.join(dataDir, 'auth.json');
    PROJECTS_FILE = path.join(dataDir, 'projects.json');
    SETTINGS_FILE = path.join(dataDir, 'settings.json');

    // Migrate existing data from old location if needed
    const oldAuth = path.join(__dirname, 'Assets', 'Agents', 'Core', 'auth.json');
    const oldProjects = path.join(__dirname, 'Assets', 'Agents', 'Core', 'projects.json');

    if (!fs.existsSync(AUTH_FILE) && fs.existsSync(oldAuth)) {
        fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
        fs.copyFileSync(oldAuth, AUTH_FILE);
    }
    if (!fs.existsSync(PROJECTS_FILE) && fs.existsSync(oldProjects)) {
        fs.mkdirSync(path.dirname(PROJECTS_FILE), { recursive: true });
        fs.copyFileSync(oldProjects, PROJECTS_FILE);
    }

    createWindow();
});

app.on('window-all-closed', () => {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// --- Data helpers ---
function loadData(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.error(`Failed to load ${filePath}:`, e.message);
    }
    return filePath.includes('auth') ? {} : (filePath.includes('settings') ? {} : []);
}

function saveData(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Encryption helpers ---
function encryptPassword(plaintext) {
    if (!safeStorage.isEncryptionAvailable()) {
        return plaintext;
    }
    return safeStorage.encryptString(plaintext).toString('base64');
}

function decryptPassword(stored) {
    if (!safeStorage.isEncryptionAvailable()) {
        return stored;
    }
    try {
        const buffer = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(buffer);
    } catch (e) {
        // Fallback: stored value is still plaintext (pre-migration)
        return stored;
    }
}

function migrateAuthEncryption(authData) {
    if (!safeStorage.isEncryptionAvailable()) return authData;
    let migrated = false;
    for (const [key, val] of Object.entries(authData)) {
        if (val.password && !val.encrypted) {
            val.password = encryptPassword(val.password);
            val.encrypted = true;
            migrated = true;
        }
    }
    if (migrated) {
        saveData(AUTH_FILE, authData);
    }
    return authData;
}

function loadAuthWithDecrypt() {
    const authData = loadData(AUTH_FILE);
    migrateAuthEncryption(authData);
    const decrypted = {};
    for (const [key, val] of Object.entries(authData)) {
        decrypted[key] = {
            username: val.username,
            password: val.encrypted ? decryptPassword(val.password) : val.password
        };
    }
    return decrypted;
}

// --- IPC Handlers ---

// Projects
ipcMain.handle('load-projects', () => {
    return loadData(PROJECTS_FILE);
});

ipcMain.handle('save-project', (event, project) => {
    const projects = loadData(PROJECTS_FILE);
    if (!projects.some(p => p.path === project.path)) {
        projects.push(project);
        saveData(PROJECTS_FILE, projects);
    }
    return { success: true };
});

ipcMain.handle('delete-project', (event, pathToRemove) => {
    let projects = loadData(PROJECTS_FILE);
    projects = projects.filter(p => p.path !== pathToRemove);
    saveData(PROJECTS_FILE, projects);
    return { success: true };
});

// Auth
ipcMain.handle('load-auth', () => {
    const auth = loadData(AUTH_FILE);
    const safeAuth = {};
    for (const [key, val] of Object.entries(auth)) {
        safeAuth[key] = { username: val.username };
    }
    return safeAuth;
});

ipcMain.handle('save-auth', (event, creds) => {
    const authData = loadData(AUTH_FILE);
    const key = creds.url || 'global';
    authData[key] = {
        username: creds.username,
        password: encryptPassword(creds.password),
        encrypted: true
    };
    saveData(AUTH_FILE, authData);
    return { success: true };
});

ipcMain.handle('delete-auth', (event, urlKey) => {
    const authData = loadData(AUTH_FILE);
    if (authData[urlKey]) {
        delete authData[urlKey];
        saveData(AUTH_FILE, authData);
        return { success: true };
    }
    return { success: false, error: 'Credential not found' };
});

// Settings
ipcMain.handle('load-settings', () => {
    return loadData(SETTINGS_FILE);
});

ipcMain.handle('save-settings', (event, settings) => {
    saveData(SETTINGS_FILE, settings);
    return { success: true };
});

// Browse folder (native dialog)
ipcMain.handle('browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select SVN Workspace Folder',
        properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { path: null };
    }
    return { path: result.filePaths[0] };
});

// Validate SVN repo
ipcMain.handle('validate-repo', (event, repoPath) => {
    const svnDir = path.join(repoPath, '.svn');
    return { isValid: fs.existsSync(svnDir) && fs.statSync(svnDir).isDirectory() };
});

// Delete file
ipcMain.handle('delete-file', (event, filePath, cwd) => {
    const fullPath = cwd ? path.join(cwd, filePath) : filePath;
    try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// List directory contents
ipcMain.handle('list-directory', (event, dirPath) => {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const items = entries
            .filter(e => e.name !== '.svn')
            .map(e => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
                path: path.join(dirPath, e.name)
            }))
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        return { success: true, items };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// File watcher
ipcMain.handle('watch-directory', (event, dirPath) => {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
    try {
        fileWatcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
            if (filename && !filename.includes('.svn')) {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('file-changed', { eventType, filename });
                }
            }
        });
        fileWatcher.on('error', (err) => {
            console.error('File watcher error:', err.message);
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('unwatch-directory', () => {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
    return { success: true };
});

// Search files in working copy
ipcMain.handle('search-files', async (event, searchPath, query, searchType) => {
    const MAX_RESULTS = 200;
    const EXCLUDED_DIRS = new Set(['.svn', 'node_modules', '.git', '.hg', '__pycache__', '.DS_Store']);
    const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB limit for content search
    const results = [];

    if (!query || !searchPath) {
        return { success: true, results: [] };
    }

    const queryLower = query.toLowerCase();

    function walkDirectory(dir) {
        if (results.length >= MAX_RESULTS) return;

        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            return; // skip unreadable directories
        }

        for (const entry of entries) {
            if (results.length >= MAX_RESULTS) return;
            if (EXCLUDED_DIRS.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(searchPath, fullPath);

            if (entry.isDirectory()) {
                walkDirectory(fullPath);
            } else if (entry.isFile()) {
                if (searchType === 'filename') {
                    if (entry.name.toLowerCase().includes(queryLower)) {
                        results.push({
                            path: relativePath,
                            name: entry.name,
                            type: 'filename'
                        });
                    }
                } else if (searchType === 'content') {
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.size > MAX_FILE_SIZE) continue;

                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        const matchedLines = [];

                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].toLowerCase().includes(queryLower)) {
                                matchedLines.push({
                                    lineNumber: i + 1,
                                    text: lines[i].substring(0, 300) // truncate long lines
                                });
                                if (matchedLines.length >= 3) break; // max 3 preview lines per file
                            }
                        }

                        if (matchedLines.length > 0) {
                            results.push({
                                path: relativePath,
                                name: entry.name,
                                type: 'content',
                                matches: matchedLines
                            });
                        }
                    } catch (e) {
                        // skip binary or unreadable files
                    }
                }
            }
        }
    }

    try {
        walkDirectory(searchPath);
        return { success: true, results, truncated: results.length >= MAX_RESULTS };
    } catch (e) {
        return { success: false, error: e.message, results: [] };
    }
});

// Save file (for patch export)
ipcMain.handle('save-file-dialog', async (event, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save File',
        defaultPath: defaultName || 'output.patch',
        filters: [
            { name: 'Patch Files', extensions: ['patch', 'diff'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (result.canceled || !result.filePath) {
        return { path: null };
    }
    return { path: result.filePath };
});

ipcMain.handle('write-file', (event, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Open file dialog (for patch apply)
ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Patch File',
        properties: ['openFile'],
        filters: [
            { name: 'Patch Files', extensions: ['patch', 'diff'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { path: null };
    }
    return { path: result.filePaths[0] };
});

// Run SVN command
ipcMain.handle('run-svn', (event, command, cwd, repoUrl) => {
    return new Promise((resolve) => {
        // Load auth credentials (decrypted)
        const authData = loadAuthWithDecrypt();
        let creds = null;

        if (repoUrl) {
            const cleanUrl = repoUrl.replace(/\/+$/, '');
            for (const [key, val] of Object.entries(authData)) {
                if (key === 'global') continue;
                if (cleanUrl.includes(key.replace(/\/+$/, ''))) {
                    creds = val;
                    break;
                }
            }
        }
        if (!creds && authData.global) {
            creds = authData.global;
        }

        // Build svn command args
        const args = [...command];

        // Add mandatory flags
        args.push('--non-interactive', '--trust-server-cert');

        // Add auth username (password via stdin to avoid process list exposure)
        let passwordForStdin = null;
        if (creds) {
            args.push('--username', creds.username);
            passwordForStdin = creds.password;
        }

        // Add --no-auth-cache
        args.push('--no-auth-cache');

        // Validate cwd
        if (cwd && !fs.existsSync(cwd) && command[0] !== 'checkout') {
            resolve({ success: false, error: `Directory not found: ${cwd}` });
            return;
        }

        // For checkout, ensure parent directory exists
        if (command[0] === 'checkout' && command.length >= 3) {
            const checkoutPath = command[2];
            const parentDir = path.dirname(checkoutPath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }
        }

        // checkout doesn't need cwd - use undefined
        const spawnCwd = command[0] === 'checkout' ? undefined : (cwd || undefined);

        const proc = spawn('svn', args, {
            cwd: spawnCwd,
            env: { ...process.env }
        });

        // Pass password via stdin to avoid exposure in process listings
        if (passwordForStdin) {
            proc.stdin.write(passwordForStdin + '\n');
            proc.stdin.end();
        }

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('svn-output', { stream: 'stdout', data: chunk });
            }
        });

        proc.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('svn-output', { stream: 'stderr', data: chunk });
            }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, output: stdout });
            } else {
                // Fallback: retry with --password flag if stdin method fails
                if (passwordForStdin && stderr.includes('auth')) {
                    const retryArgs = [...args, '--password', passwordForStdin];
                    const retryProc = spawn('svn', retryArgs, {
                        cwd: spawnCwd,
                        env: { ...process.env }
                    });
                    let retryOut = '';
                    let retryErr = '';
                    retryProc.stdout.on('data', (d) => {
                        const chunk = d.toString();
                        retryOut += chunk;
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('svn-output', { stream: 'stdout', data: chunk });
                        }
                    });
                    retryProc.stderr.on('data', (d) => {
                        const chunk = d.toString();
                        retryErr += chunk;
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('svn-output', { stream: 'stderr', data: chunk });
                        }
                    });
                    retryProc.on('close', (retryCode) => {
                        if (retryCode === 0) {
                            resolve({ success: true, output: retryOut });
                        } else {
                            resolve({ success: false, output: retryOut, error: retryErr || retryOut });
                        }
                    });
                    retryProc.on('error', (err) => {
                        resolve({ success: false, error: err.message });
                    });
                } else {
                    resolve({ success: false, output: stdout, error: stderr || stdout });
                }
            }
        });

        proc.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
});
