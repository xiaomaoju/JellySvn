const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
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
let pendingOpenArgsQueue = [];
let rendererReady = false;

// Parse command-line args: folder path, view flags, and quickaction reports
function parseOpenArgs(argv) {
    const args = argv.slice(app.isPackaged ? 1 : 2);
    let folderPath = null;
    let view = null;
    let qa = null;
    let qaMsg = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--commit') {
            view = 'commit-view';
        } else if (arg === '--log') {
            view = 'log';
        } else if (arg === '--qa' && i + 1 < args.length) {
            qa = args[++i];
        } else if (arg === '--qa-msg' && i + 1 < args.length) {
            qaMsg = args[++i];
        } else if (arg === '--qa-msg-file' && i + 1 < args.length) {
            const qaMsgPath = args[++i];
            try {
                qaMsg = fs.readFileSync(qaMsgPath, 'utf-8');
            } catch (e) { /* ignore */ }
            // Delete tmp file immediately after read so shell's `sleep 5 && rm`
            // race doesn't matter — cold-start Electron can exceed 5s.
            try { fs.unlinkSync(qaMsgPath); } catch (e) { /* ignore */ }
        } else if (!arg.startsWith('-')) {
            try {
                const resolved = path.resolve(arg);
                if (fs.existsSync(resolved)) {
                    folderPath = resolved;
                }
            } catch (e) { /* ignore */ }
        }
    }
    return (folderPath || view || qa) ? { folderPath, view, qa, qaMsg } : null;
}

// Send open args to renderer when ready, otherwise queue them
function sendOpenArgs(args) {
    if (!args) return;
    if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-with-args', args);
    } else {
        pendingOpenArgsQueue.push(args);
    }
}

function flushPendingOpenArgs() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    while (pendingOpenArgsQueue.length > 0) {
        const args = pendingOpenArgsQueue.shift();
        mainWindow.webContents.send('open-with-args', args);
    }
}

// Single instance lock — if app is already running, focus it and pass new args
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv) => {
        const args = parseOpenArgs(argv);
        if (args) {
            sendOpenArgs(args);
        }
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

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

    // Parse initial command-line args (first launch)
    const initialArgs = parseOpenArgs(process.argv);
    if (initialArgs) {
        pendingOpenArgsQueue.push(initialArgs);
    }
});

// Renderer signals it's ready to receive open-with-args (after bindOpenWithArgs runs)
ipcMain.handle('renderer-ready', () => {
    rendererReady = true;
    flushPendingOpenArgs();
    return { success: true };
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

// Guard mutating filesystem IPCs to paths inside a known project's working copy.
// A buggy/compromised renderer otherwise could invoke deleteFile('/etc/...').
// Dialog-originated paths bypass by passing `allowDialog: true`.
function isPathWithinProjects(target) {
    try {
        const resolved = path.resolve(target);
        const projects = loadData(PROJECTS_FILE);
        if (!Array.isArray(projects)) return false;
        for (const p of projects) {
            if (!p || !p.path) continue;
            const root = path.resolve(p.path);
            if (resolved === root || resolved.startsWith(root + path.sep)) {
                return true;
            }
        }
    } catch (e) { /* fall through */ }
    return false;
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

function findSvnRoot(startPath) {
    let dir = path.resolve(startPath);
    const root = path.parse(dir).root;
    while (dir !== root) {
        const svnDir = path.join(dir, '.svn');
        if (fs.existsSync(svnDir) && fs.statSync(svnDir).isDirectory()) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return null;
}

// Validate SVN repo
ipcMain.handle('validate-repo', (event, repoPath) => {
    const svnRoot = findSvnRoot(repoPath);
    return { isValid: !!svnRoot, svnRoot: svnRoot || null };
});

// Delete file (restricted to paths inside a known project working copy)
ipcMain.handle('delete-file', (event, filePath, cwd) => {
    const fullPath = cwd ? path.join(cwd, filePath) : filePath;
    if (!isPathWithinProjects(fullPath)) {
        return { success: false, error: 'Refused: path is outside any known project working copy.' };
    }
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

ipcMain.handle('reveal-in-file-manager', (event, filePath) => {
    shell.showItemInFolder(path.resolve(filePath));
});

// List directory contents (with size + mtime for tree view)
ipcMain.handle('list-directory', (event, dirPath) => {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const items = entries
            .filter(e => e.name !== '.svn')
            .map(e => {
                const full = path.join(dirPath, e.name);
                const info = {
                    name: e.name,
                    type: e.isDirectory() ? 'directory' : 'file',
                    path: full,
                    size: null,
                    mtime: null,
                };
                try {
                    const st = fs.statSync(full);
                    info.size = st.size;
                    info.mtime = st.mtimeMs;
                } catch (err) { /* symlink to nothing, permission, etc. */ }
                return info;
            })
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
            if (!filename) return;
            // Filter by path segment, not substring — previously a user file
            // named "README.svn.md" was silently dropped because it contained
            // the literal ".svn". Only ignore actual .svn metadata paths.
            const segments = filename.split(/[\\/]/);
            if (segments.includes('.svn')) return;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('file-changed', { eventType, filename });
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
        // Auto-create parent directory (e.g. .svn-shelves/) so first-time
        // writes to a fresh subdir succeed instead of failing with ENOENT.
        const dir = path.dirname(filePath);
        if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Copy file (for drag & drop)
ipcMain.handle('copy-file', (event, srcPath, destPath) => {
    try {
        const dir = path.dirname(destPath);
        if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.copyFileSync(srcPath, destPath);
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

// Open external diff tool
ipcMain.handle('open-external-diff', (event, { tool, basePath, workingPath }) => {
    const toolCommands = {
        'opendiff': ['/usr/bin/opendiff', [basePath, workingPath]],
        'vscode': ['code', ['--diff', basePath, workingPath]],
        'bbedit': ['bbedit', ['--diff', basePath, workingPath]],
        'kdiff3': ['kdiff3', [basePath, workingPath]]
    };

    const cmd = toolCommands[tool];
    if (!cmd) return { success: false, error: `Unknown tool: ${tool}` };

    try {
        const proc = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' });
        proc.unref();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Run SVN command
const SVN_TIMEOUT_MS = 60000; // 60 second timeout for SVN commands

ipcMain.handle('run-svn', (event, command, cwd, repoUrl) => {
    return new Promise((resolve) => {
        // Load auth credentials (decrypted)
        const authData = loadAuthWithDecrypt();
        let creds = null;

        if (repoUrl) {
            const cleanUrl = repoUrl.replace(/\/+$/, '');
            // Sort by key length desc so a more specific (longer-path) match
            // wins over a generic host-level key, and iteration order is
            // deterministic regardless of insertion order.
            const sortedKeys = Object.keys(authData)
                .filter(k => k !== 'global')
                .sort((a, b) => b.length - a.length);
            for (const key of sortedKeys) {
                const normKey = key.replace(/\/+$/, '');
                if (cleanUrl === normKey || cleanUrl.startsWith(normKey + '/')) {
                    creds = authData[key];
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
        // For non-checkout commands, if cwd has no .svn, walk up to find svn root
        let effectiveCwd = cwd || undefined;
        if (command[0] !== 'checkout' && effectiveCwd) {
            const svnRoot = findSvnRoot(effectiveCwd);
            if (svnRoot) effectiveCwd = svnRoot;
        }
        const spawnCwd = command[0] === 'checkout' ? undefined : effectiveCwd;

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
        let timedOut = false;

        // Timeout to prevent infinite hang
        const timeoutId = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
            setTimeout(() => {
                try { proc.kill('SIGKILL'); } catch (e) { /* already dead */ }
            }, 3000);
        }, SVN_TIMEOUT_MS);

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
            clearTimeout(timeoutId);
            if (timedOut) {
                resolve({ success: false, error: `SVN command timed out after ${SVN_TIMEOUT_MS / 1000}s. The server may be unreachable.` });
                return;
            }
            if (code === 0) {
                resolve({ success: true, output: stdout });
            } else {
                // Never retry with --password on the command line — that
                // would leak the plaintext password to the process list
                // (visible to every user via `ps`). Primary stdin delivery
                // already works on all supported svn versions; if it fails,
                // surface the auth error to the UI instead.
                resolve({ success: false, output: stdout, error: stderr || stdout });
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutId);
            resolve({ success: false, error: err.message });
        });
    });
});

// --- Placeholder Management ---

ipcMain.handle('placeholder:scan', async (event, dirPath) => {
    if (!dirPath || !fs.existsSync(dirPath)) {
        return { success: false, error: 'Directory not found' };
    }

    const EXCLUDED_DIRS = new Set(['.svn', 'node_modules', '.git', '.hg', '__pycache__', '.DS_Store']);
    const files = [];
    let totalFiles = 0;
    let placeholders = 0;
    let realFiles = 0;
    let savedBytes = 0;

    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const entry of entries) {
            if (EXCLUDED_DIRS.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                try {
                    const st = fs.statSync(full);
                    const relPath = path.relative(dirPath, full);
                    const isPlaceholder = st.size === 0;
                    files.push({ relPath, size: st.size, isPlaceholder });
                    totalFiles++;
                    if (isPlaceholder) {
                        placeholders++;
                    } else {
                        realFiles++;
                        savedBytes += st.size;
                    }
                } catch (e) { /* skip unreadable */ }
            }
        }
    }

    walk(dirPath);
    return { success: true, totalFiles, placeholders, realFiles, savedBytes, files };
});

ipcMain.handle('placeholder:download', async (event, { wcRoot, files, remoteUrl }) => {
    let baseUrl = remoteUrl || '';
    if (!isPathWithinProjects(wcRoot)) {
        return { success: 0, failed: files.length, error: 'Refused: wcRoot is outside any known project.' };
    }

    if (!baseUrl && wcRoot) {
        const svnRoot = findSvnRoot(wcRoot);
        const infoTarget = svnRoot || wcRoot;
        try {
            const result = await new Promise((resolve) => {
                const proc = spawn('svn', ['info', infoTarget]);
                let out = '';
                proc.stdout.on('data', d => out += d.toString());
                proc.on('close', () => resolve(out));
                proc.on('error', () => resolve(''));
            });
            const match = result.match(/^URL:\s*(.+)$/m);
            if (match) {
                const rootUrl = match[1].trim();
                if (svnRoot && svnRoot !== path.resolve(wcRoot)) {
                    const relFromRoot = path.relative(svnRoot, path.resolve(wcRoot)).replace(/\\/g, '/');
                    baseUrl = rootUrl.replace(/\/+$/, '') + '/' + relFromRoot;
                } else {
                    baseUrl = rootUrl;
                }
            }
        } catch (e) { /* fall through */ }
    }

    if (!baseUrl) {
        return { success: 0, failed: files.length, error: 'Could not resolve remote URL' };
    }

    const authData = loadAuthWithDecrypt();
    let dlCreds = null;
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const sortedAuthKeys = Object.keys(authData).filter(k => k !== 'global').sort((a, b) => b.length - a.length);
    for (const key of sortedAuthKeys) {
        const normKey = key.replace(/\/+$/, '');
        if (cleanBase === normKey || cleanBase.startsWith(normKey + '/')) { dlCreds = authData[key]; break; }
    }
    if (!dlCreds && authData.global) dlCreds = authData.global;

    const svnRoot = findSvnRoot(wcRoot);
    const isWorkingCopy = !!svnRoot;

    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const relPath = files[i];
        const localPath = path.join(wcRoot, relPath);
        const resolvedLocal = path.resolve(localPath);
        const resolvedRoot = path.resolve(wcRoot);
        if (!resolvedLocal.startsWith(resolvedRoot + path.sep) && resolvedLocal !== resolvedRoot) {
            failed++;
            continue;
        }

        event.sender.send('placeholder:progress', { current: i + 1, total: files.length, file: relPath });

        try {
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
            const fileUrl = baseUrl.replace(/\/+$/, '') + '/' + relPath.replace(/\\/g, '/');
            const exportArgs = ['export', '--force', fileUrl, localPath, '--non-interactive', '--trust-server-cert'];
            if (dlCreds) { exportArgs.push('--username', dlCreds.username, '--password', dlCreds.password); }
            await new Promise((resolve, reject) => {
                const proc = spawn('svn', exportArgs);
                let stderr = '';
                proc.stderr.on('data', d => stderr += d.toString());
                proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
                proc.on('error', reject);
            });
            success++;
        } catch (e) {
            failed++;
        }
    }

    return { success, failed };
});

ipcMain.handle('placeholder:truncate', async (event, { files }) => {
    let success = 0;
    let failed = 0;

    for (const absPath of files) {
        if (!isPathWithinProjects(absPath)) {
            failed++;
            continue;
        }
        try {
            fs.truncateSync(absPath, 0);
            success++;
        } catch (e) {
            failed++;
        }
    }

    return { success, failed };
});

ipcMain.handle('placeholder:syncStructure', async (event, { remoteUrl, localDir }) => {
    if (!remoteUrl || !localDir) {
        return { success: false, error: 'Missing remoteUrl or localDir' };
    }
    if (!isPathWithinProjects(localDir)) {
        return { success: false, error: 'Refused: localDir is outside any known project.' };
    }

    try {
        const listOutput = await new Promise((resolve, reject) => {
            const proc = spawn('svn', ['list', '-R', remoteUrl, '--non-interactive', '--trust-server-cert']);
            let out = '';
            let err = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.stderr.on('data', d => err += d.toString());
            proc.on('close', (code) => {
                if (code === 0) resolve(out);
                else reject(new Error(err));
            });
            proc.on('error', reject);
        });

        const remoteEntries = listOutput.split('\n').filter(l => l.trim());
        const remoteSet = new Set(remoteEntries);

        let dirsCreated = 0;
        let filesCreated = 0;
        let deleted = 0;

        for (const entry of remoteEntries) {
            const localPath = path.join(localDir, entry);
            if (entry.endsWith('/')) {
                if (!fs.existsSync(localPath)) {
                    fs.mkdirSync(localPath, { recursive: true });
                    dirsCreated++;
                }
            } else {
                const dir = path.dirname(localPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                if (!fs.existsSync(localPath)) {
                    fs.writeFileSync(localPath, '');
                    filesCreated++;
                }
            }
        }

        const EXCLUDED_DIRS = new Set(['.svn', 'node_modules', '.git']);
        function cleanLocal(dir, relPrefix) {
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
            for (const entry of entries) {
                if (EXCLUDED_DIRS.has(entry.name)) continue;
                const rel = relPrefix ? relPrefix + '/' + entry.name : entry.name;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    cleanLocal(full, rel);
                    if (!remoteSet.has(rel + '/')) {
                        try {
                            const remaining = fs.readdirSync(full);
                            if (remaining.length === 0) {
                                fs.rmdirSync(full);
                                deleted++;
                            }
                        } catch (e) { /* skip */ }
                    }
                } else if (entry.isFile()) {
                    if (!remoteSet.has(rel)) {
                        try { fs.unlinkSync(full); deleted++; } catch (e) { /* skip */ }
                    }
                }
            }
        }
        cleanLocal(localDir, '');

        return { success: true, dirsCreated, filesCreated, deleted };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('placeholder:checkoutAsPlaceholder', async (event, { remoteUrl, localDir }) => {
    if (!remoteUrl || !localDir) {
        return { success: false, error: 'Missing remoteUrl or localDir' };
    }
    try {
        const authData = loadAuthWithDecrypt();
        let creds = null;
        const cleanUrl = remoteUrl.replace(/\/+$/, '');
        const sortedKeys = Object.keys(authData).filter(k => k !== 'global').sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            const normKey = key.replace(/\/+$/, '');
            if (cleanUrl === normKey || cleanUrl.startsWith(normKey + '/')) { creds = authData[key]; break; }
        }
        if (!creds && authData.global) creds = authData.global;

        // Step 1: svn checkout --depth empty (only .svn metadata, no files)
        const existingSvnRoot = findSvnRoot(localDir);
        if (!existingSvnRoot) {
            const coArgs = ['checkout', '--depth', 'empty', remoteUrl, localDir, '--non-interactive', '--trust-server-cert'];
            if (creds) { coArgs.push('--username', creds.username, '--password', creds.password); }
            await new Promise((resolve, reject) => {
                const proc = spawn('svn', coArgs);
                let err = '';
                proc.stderr.on('data', d => err += d.toString());
                proc.on('close', code => code === 0 ? resolve() : reject(new Error(err)));
                proc.on('error', reject);
            });
        }

        // Step 2: svn list -R to get remote structure, cache it locally
        const listArgs = ['list', '-R', remoteUrl, '--non-interactive', '--trust-server-cert'];
        if (creds) { listArgs.push('--username', creds.username, '--password', creds.password); }
        const listOutput = await new Promise((resolve, reject) => {
            const proc = spawn('svn', listArgs);
            let out = '', err = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.stderr.on('data', d => err += d.toString());
            proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(err)));
            proc.on('error', reject);
        });

        const entries = listOutput.split('\n').filter(l => l.trim());
        // Save remote listing cache for tree view
        const cacheFile = path.join(localDir, '.svn', 'jelly-remote-listing.json');
        fs.writeFileSync(cacheFile, JSON.stringify(entries));

        return { success: true, dirsCreated: 0, filesCreated: entries.length, entries };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Refresh remote listing from SVN server and update cache
ipcMain.handle('placeholder:refreshRemoteListing', async (event, localDir) => {
    const svnRoot = findSvnRoot(localDir) || localDir;
    if (!isPathWithinProjects(svnRoot)) {
        return { success: false, error: 'Refused: path outside known project' };
    }
    try {
        const infoOut = await new Promise((resolve) => {
            const proc = spawn('svn', ['info', svnRoot]);
            let out = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.on('close', () => resolve(out));
            proc.on('error', () => resolve(''));
        });
        const urlMatch = infoOut.match(/^URL:\s*(.+)$/m);
        if (!urlMatch) return { success: false, error: 'Cannot determine remote URL' };
        const remoteUrl = urlMatch[1].trim();

        const authData = loadAuthWithDecrypt();
        let creds = null;
        const cleanUrl = remoteUrl.replace(/\/+$/, '');
        const sortedKeys = Object.keys(authData).filter(k => k !== 'global').sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            const normKey = key.replace(/\/+$/, '');
            if (cleanUrl === normKey || cleanUrl.startsWith(normKey + '/')) { creds = authData[key]; break; }
        }
        if (!creds && authData.global) creds = authData.global;

        const listArgs = ['list', '-R', remoteUrl, '--non-interactive', '--trust-server-cert'];
        if (creds) { listArgs.push('--username', creds.username, '--password', creds.password); }

        const listOutput = await new Promise((resolve, reject) => {
            const proc = spawn('svn', listArgs);
            let out = '', err = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.stderr.on('data', d => err += d.toString());
            proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(err)));
            proc.on('error', reject);
        });

        const entries = listOutput.split('\n').filter(l => l.trim());
        const cacheFile = path.join(svnRoot, '.svn', 'jelly-remote-listing.json');
        fs.writeFileSync(cacheFile, JSON.stringify(entries));
        return { success: true, entries };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Read cached remote listing
ipcMain.handle('placeholder:getRemoteListing', async (event, localDir) => {
    const svnRoot = findSvnRoot(localDir) || localDir;
    const cacheFile = path.join(svnRoot, '.svn', 'jelly-remote-listing.json');
    if (fs.existsSync(cacheFile)) {
        try {
            return { success: true, entries: JSON.parse(fs.readFileSync(cacheFile, 'utf8')) };
        } catch (e) { /* fall through */ }
    }
    return { success: false, entries: [] };
});

// Download folder via sparse checkout: svn update --set-depth infinity --parents
ipcMain.handle('placeholder:downloadFolder', async (event, { wcRoot, folderRelPath }) => {
    const svnRoot = findSvnRoot(wcRoot) || wcRoot;
    if (!isPathWithinProjects(svnRoot)) {
        return { success: false, error: 'Refused: path outside known project' };
    }
    const targetPath = folderRelPath ? path.join(svnRoot, folderRelPath) : svnRoot;

    const authData = loadAuthWithDecrypt();
    let creds = null;
    try {
        const infoOut = await new Promise((resolve) => {
            const proc = spawn('svn', ['info', svnRoot]);
            let out = '';
            proc.stdout.on('data', d => out += d.toString());
            proc.on('close', () => resolve(out));
            proc.on('error', () => resolve(''));
        });
        const urlMatch = infoOut.match(/^URL:\s*(.+)$/m);
        if (urlMatch) {
            const repoUrl = urlMatch[1].trim().replace(/\/+$/, '');
            const sortedKeys = Object.keys(authData).filter(k => k !== 'global').sort((a, b) => b.length - a.length);
            for (const key of sortedKeys) {
                const normKey = key.replace(/\/+$/, '');
                if (repoUrl === normKey || repoUrl.startsWith(normKey + '/')) { creds = authData[key]; break; }
            }
        }
    } catch (e) { /* fall through */ }
    if (!creds && authData.global) creds = authData.global;

    const updateArgs = ['update', '--set-depth', 'infinity', '--parents', targetPath, '--non-interactive', '--trust-server-cert'];
    if (creds) { updateArgs.push('--username', creds.username, '--password', creds.password); }

    try {
        const output = await new Promise((resolve, reject) => {
            const proc = spawn('svn', updateArgs, { cwd: svnRoot });
            let out = '', err = '';
            proc.stdout.on('data', d => {
                out += d.toString();
                event.sender.send('placeholder:progress', { current: 0, total: 1, file: d.toString().trim().substring(0, 60) });
            });
            proc.stderr.on('data', d => err += d.toString());
            proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(err)));
            proc.on('error', reject);
        });
        return { success: true, output };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Truncate folder via sparse checkout: svn update --set-depth empty
ipcMain.handle('placeholder:truncateFolder', async (event, { wcRoot, folderRelPath }) => {
    const svnRoot = findSvnRoot(wcRoot) || wcRoot;
    if (!isPathWithinProjects(svnRoot)) {
        return { success: false, error: 'Refused: path outside known project' };
    }
    const targetPath = folderRelPath ? path.join(svnRoot, folderRelPath) : svnRoot;
    const updateArgs = ['update', '--set-depth', 'empty', targetPath, '--non-interactive', '--trust-server-cert'];

    try {
        await new Promise((resolve, reject) => {
            const proc = spawn('svn', updateArgs, { cwd: svnRoot });
            let err = '';
            proc.stderr.on('data', d => err += d.toString());
            proc.on('close', code => code === 0 ? resolve() : reject(new Error(err)));
            proc.on('error', reject);
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
