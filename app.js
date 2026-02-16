// App State
const state = {
    currentView: 'status',
    projects: [],
    selectedProjectIndex: -1,
    selectedFiles: new Set(),
    isScanning: false,
    workingCopy: [],
    logEntries: [],
    logPage: 1,
    logLimit: 20,

    // Auth manager
    authEntries: [],
    editingAuthKey: null,

    // Diff mode
    diffMode: 'inline', // 'inline' | 'side-by-side'

    // Log filter
    logFilter: {
        keyword: '',
        author: '',
        dateFrom: '',
        dateTo: ''
    },

    // Operation progress
    currentOperation: null,

    // Auth context for retrying commands
    lastFailedCommand: null,

    // Tree view
    treeData: {},
    treeExpanded: new Set(),
    treeFolderStatus: {},

    // Properties view
    properties: [],
    propertiesTarget: '.',
    editingProp: null,

    // Branch/Tag management
    branchInfo: null,
    branchList: [],
    tagList: [],
    repoRootUrl: '',

    // Settings
    settings: {
        logLimit: 20,
        autoRefresh: false,
        autoRefreshInterval: 5000,
        theme: 'dark'
    },

    // File watcher
    watcherActive: false,

    // Lock management
    lockFiles: [],

    // Blame/Annotate
    blameData: [],
    blameFile: '',

    // Merge operations
    mergePreview: [],
    mergeSource: '',
    mergeRevFrom: '',
    mergeRevTo: '',

    // Search
    searchResults: [],
    searchQuery: '',
    searchType: 'filename', // 'filename' | 'content'
    searchLoading: false,

    // Ignore management
    ignorePatterns: [],
    ignoreTarget: '.',

    // Changelist
    changelists: {},

    // Patch
    patchContent: ''
};

// UI Elements
const elements = {
    contentArea: document.getElementById('main-view'),
    pageTitle: document.getElementById('page-title'),
    consoleLog: document.getElementById('console-log'),
    navItems: document.querySelectorAll('.nav-item'),
    refreshBtn: document.getElementById('btn-refresh'),
    bulkActions: document.getElementById('bulk-actions'),
    selectedCount: document.getElementById('selected-count'),
    modalContainer: document.getElementById('modal-container'),
    checkoutModal: document.getElementById('checkout-modal'),
    authModal: document.getElementById('auth-modal'),
    projectTabs: document.getElementById('project-tabs'),
    currentRepo: document.getElementById('current-repo'),
    checkoutPathInput: document.getElementById('checkout-path'),
    diffModal: document.getElementById('diff-modal'),
    diffContent: document.getElementById('diff-content'),
    diffModalTitle: document.getElementById('diff-modal-title'),
    shortcutsModal: document.getElementById('shortcuts-modal')
};

// Initialize
async function init() {
    await loadSettings();
    bindEvents();
    bindSvnOutputStream();
    bindFileWatcher();
    bindKeyboardShortcuts();
    await loadProjects();

    // Add scroll shadow indicator to nav-menu
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        navMenu.addEventListener('scroll', () => {
            const atBottom = navMenu.scrollHeight - navMenu.scrollTop - navMenu.clientHeight < 10;
            navMenu.classList.toggle('scrolled-bottom', atBottom);
            navMenu.classList.toggle('has-scroll', navMenu.scrollHeight > navMenu.clientHeight);
        });
        // Initial check
        setTimeout(() => {
            if (navMenu.scrollHeight > navMenu.clientHeight) {
                navMenu.classList.add('has-scroll');
            }
        }, 100);
    }
}

async function loadSettings() {
    try {
        const saved = await window.api.loadSettings();
        if (saved && typeof saved === 'object') {
            state.settings = { ...state.settings, ...saved };
            state.logLimit = state.settings.logLimit || 20;
        }
    } catch (err) {
        // Use defaults
    }
}

async function saveSettings() {
    try {
        await window.api.saveSettings(state.settings);
    } catch (err) {
        logToConsole(`Failed to save settings: ${err.message}`, 'error');
    }
}

function bindSvnOutputStream() {
    window.api.onSvnOutput((payload) => {
        if (!state.currentOperation) return;
        const lines = payload.data.split('\n').filter(l => l.trim());
        const type = payload.stream === 'stderr' ? 'warning' : 'system';
        for (const line of lines) {
            logToConsole(line, type);
        }
    });
}

// === File Watcher ===
let _fileChangeTimer = null;

function bindFileWatcher() {
    window.api.onFileChanged((payload) => {
        if (!state.settings.autoRefresh || !state.watcherActive) return;
        if (state.currentOperation) return;
        clearTimeout(_fileChangeTimer);
        _fileChangeTimer = setTimeout(() => {
            if (state.currentView === 'status' || state.currentView === 'commit-view' || state.currentView === 'revert-view') {
                logToConsole(`File changed: ${payload.filename} — auto-refreshing...`, 'system');
                refreshStatus();
            }
        }, state.settings.autoRefreshInterval || 5000);
    });
}

async function startWatcher() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;
    try {
        const result = await window.api.watchDirectory(project.path);
        if (result.success) {
            state.watcherActive = true;
            logToConsole('File watcher started.', 'success');
        }
    } catch (err) {
        logToConsole(`Watcher error: ${err.message}`, 'error');
    }
}

async function stopWatcher() {
    try {
        await window.api.unwatchDirectory();
        state.watcherActive = false;
        logToConsole('File watcher stopped.', 'system');
    } catch (err) {
        // ignore
    }
}

// === Keyboard Shortcuts ===
function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Skip if typing in an input/textarea
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            if (e.key === 'Escape') {
                e.target.blur();
            }
            if (e.ctrlKey && e.key === 'Enter' && state.currentView === 'commit-view') {
                e.preventDefault();
                inlineCommit();
            }
            return;
        }

        // ? = show shortcuts help
        if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            openShortcutsModal();
            return;
        }

        // Escape = close modals
        if (e.key === 'Escape') {
            closeModal();
            closeDiffModal();
            closeShortcutsModal();
            return;
        }

        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl) {
            const viewMap = {
                '1': 'status',
                '2': 'commit-view',
                '3': 'revert-view',
                '4': 'log',
                '5': 'tree',
                '6': 'auth',
                '7': 'properties',
                '8': 'branch',
                '9': 'settings'
            };

            if (viewMap[e.key]) {
                e.preventDefault();
                activateNavButton(viewMap[e.key]);
                switchView(viewMap[e.key]);
                return;
            }

            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                elements.refreshBtn.click();
                return;
            }

            if (e.key === 'u' || e.key === 'U') {
                e.preventDefault();
                runSvn(['update']);
                return;
            }

            if (e.key === 'Enter' && state.currentView === 'commit-view') {
                e.preventDefault();
                inlineCommit();
                return;
            }
        }
    });
}

function activateNavButton(view) {
    const btnId = `btn-${view}`;
    elements.navItems.forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');
}

function openShortcutsModal() {
    elements.shortcutsModal.classList.remove('hidden');
}

function closeShortcutsModal() {
    elements.shortcutsModal.classList.add('hidden');
}

function closeModal() {
    elements.modalContainer.classList.add('hidden');
    elements.checkoutModal.classList.add('hidden');
    elements.authModal.classList.add('hidden');
}

function closeDiffModal() {
    elements.diffModal.classList.add('hidden');
    elements.diffContent.innerHTML = '';
}

async function loadProjects() {
    try {
        state.projects = await window.api.loadProjects();
        if (state.projects.length > 0) {
            selectProject(0);
        } else {
            renderTabs();
        }
    } catch (err) {
        logToConsole(`Failed to load projects: ${err.message}`, 'error');
    }
}

function selectProject(index) {
    state.selectedProjectIndex = index;
    const project = state.projects[index];
    if (project) {
        elements.currentRepo.textContent = project.path;
        renderTabs();
        refreshStatus();
        // Restart watcher if auto-refresh enabled
        if (state.settings.autoRefresh) {
            startWatcher();
        }
    }
}

async function deleteProject(index, event) {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to remove '${state.projects[index].name}'?`)) return;

    const projectToDelete = state.projects[index];
    state.projects.splice(index, 1);

    // Save updated list
    await window.api.deleteProject(projectToDelete.path);

    if (state.selectedProjectIndex >= state.projects.length) {
        state.selectedProjectIndex = state.projects.length - 1;
    }

    if (state.projects.length > 0) {
        selectProject(Math.max(0, state.selectedProjectIndex));
    } else {
        state.selectedProjectIndex = -1;
        elements.currentRepo.textContent = 'Not Connected';
        renderTabs();
        render();
    }
}

function renderTabs() {
    const addButton = '<button class="add-tab" id="add-project-btn">+</button>';
    elements.projectTabs.innerHTML = state.projects.map((p, i) => `
        <div class="tab ${i === state.selectedProjectIndex ? 'active' : ''}" onclick="selectProject(${i})">
            <span>📦 ${p.name || 'Untitled'}</span>
            <button class="close-tab" onclick="deleteProject(${i}, event)">×</button>
        </div>
    `).join('') + addButton;

    // Bind plus button after innerHTML update
    document.getElementById('add-project-btn').onclick = () => {
        elements.checkoutModal.classList.remove('hidden');
    };
}

function bindEvents() {
    elements.navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.navItems.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const view = btn.id.replace('btn-', '');
            if (view === 'update-all') runSvn(['update']);
            else if (view === 'checkout') elements.checkoutModal.classList.remove('hidden');
            else switchView(view);
        });
    });

    elements.refreshBtn.addEventListener('click', () => {
        if (state.currentView === 'log') {
            fetchLog();
        } else if (state.currentView === 'tree') {
            state.treeData = {};
            state.treeExpanded = new Set();
            state.treeFolderStatus = {};
            fetchTree();
        } else if (state.currentView === 'properties') {
            fetchProperties();
        } else if (state.currentView === 'branch') {
            fetchBranchInfo();
        } else if (state.currentView === 'lock') {
            fetchLockStatus();
        } else if (state.currentView === 'blame') {
            if (state.blameFile) fetchBlame(state.blameFile);
        } else if (state.currentView === 'search') {
            if (state.searchQuery) executeSearch();
        } else if (state.currentView === 'ignore') {
            fetchIgnorePatterns();
        } else {
            refreshStatus();
        }
    });

    // Console Clear
    document.getElementById('btn-clear-console').addEventListener('click', (e) => {
        e.stopPropagation();
        elements.consoleLog.innerHTML = '';
        logToConsole('Console cleared.', 'system');
    });

    // Console Toggle
    document.getElementById('panel-header-toggle').addEventListener('click', () => {
        const panel = document.querySelector('.bottom-panel');
        const icon = document.getElementById('console-toggle-icon');
        panel.classList.toggle('collapsed');
        icon.textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
    });

    // Bulk Actions
    document.getElementById('btn-bulk-update').addEventListener('click', () => {
        runSvn(['update', ...Array.from(state.selectedFiles)]);
    });

    document.getElementById('btn-bulk-revert').addEventListener('click', () => {
        if (confirm(`Are you sure you want to revert ${state.selectedFiles.size} files?`)) {
            runSvn(['revert', '-R', ...Array.from(state.selectedFiles)]);
        }
    });

    document.getElementById('btn-bulk-commit').addEventListener('click', () => {
        openCommitModal();
    });

    // Commit Modal
    document.getElementById('btn-confirm-commit').addEventListener('click', () => {
        const msg = document.getElementById('commit-message').value;
        if (!msg) return alert('Please enter a commit message.');
        const files = Array.from(state.selectedFiles);
        closeModal();
        runSvn(['commit', '-m', msg, ...files]);
    });

    // Checkout Modal
    document.getElementById('btn-confirm-checkout').addEventListener('click', async () => {
        const url = document.getElementById('checkout-url').value;
        const path = document.getElementById('checkout-path').value.replace(/\/+$/, '');
        if (!url || !path) return alert('Please enter both URL and Path');

        closeModal();
        const success = await runSvn(['checkout', url, path], url);
        if (success) {
            const projectName = path.split('/').pop() || 'New Repo';
            await window.api.saveProject({ name: projectName, path, url });
            await loadProjects();
        }
    });

    // Native Picker
    document.getElementById('btn-browse-local').addEventListener('click', async () => {
        await openNativeDirPicker();
    });

    // Sidebar Browse button
    document.getElementById('btn-browse').addEventListener('click', async () => {
        logToConsole('Selecting directory...', 'system');
        const data = await window.api.browseFolder();
        if (data.path) {
            const cleanPath = data.path.replace(/\/+$/, '');
            const folderName = cleanPath.split('/').pop() || 'Untitled Project';

            // Validate if it's an SVN repo
            const valData = await window.api.validateRepo(data.path);

            if (!valData.isValid) {
                if (!confirm(`Warning: '${folderName}' is not a valid SVN working copy.\nDo you want to add it anyway? (You can use 'Checkout' later)`)) {
                    return;
                }
            }

            await window.api.saveProject({ name: folderName, path: data.path, url: '' });
            await loadProjects();
            logToConsole(`Added project: ${folderName}`, 'success');
        }
    });

    // Auth Modal
    document.getElementById('btn-save-auth').addEventListener('click', async () => {
        const url = document.getElementById('auth-url').value;
        const user = document.getElementById('auth-username').value;
        const pass = document.getElementById('auth-password').value;

        const result = await window.api.saveAuth({ url, username: user, password: pass });

        if (result.success) {
            logToConsole('Credentials saved.', 'success');
            elements.authModal.classList.add('hidden');
            if (state.lastFailedCommand) {
                logToConsole('Retrying last command...', 'system');
                runSvn(state.lastFailedCommand.command, state.lastFailedCommand.url);
                state.lastFailedCommand = null;
            }
        }
    });
}

async function openNativeDirPicker() {
    logToConsole('Opening native folder picker...', 'system');
    try {
        const data = await window.api.browseFolder();
        if (data.path) {
            elements.checkoutPathInput.value = data.path;
            logToConsole(`Selected: ${data.path}`, 'success');
        }
    } catch (err) {
        logToConsole(`Picker Error: ${err.message}`, 'error');
    }
}

function switchView(view) {
    state.currentView = view;
    const titles = {
        'status': 'Working Copy Status',
        'log': 'Commit History',
        'commit-view': 'Commit Changes',
        'revert-view': 'Revert Changes',
        'auth': 'Auth Manager',
        'tree': 'Project Tree',
        'properties': 'SVN Properties',
        'branch': 'Branch / Tag Manager',
        'lock': 'Lock Manager',
        'blame': 'Blame / Annotate',
        'merge': 'Merge',
        'export': 'Export / Import / Patch',
        'search': 'Search Repository',
        'ignore': 'Ignore Management',
        'tools': 'Tools',
        'settings': 'Settings'
    };
    elements.pageTitle.textContent = titles[view] || view.charAt(0).toUpperCase() + view.slice(1);
    if (view === 'log') {
        state.logPage = 1;
        fetchLog();
    } else if (view === 'auth') {
        fetchAuthEntries();
    } else if (view === 'tree') {
        fetchTree();
    } else if (view === 'properties') {
        fetchProperties();
    } else if (view === 'branch') {
        fetchBranchInfo();
    } else if (view === 'lock') {
        fetchLockStatus();
    } else if (view === 'blame') {
        renderBlameView();
    } else if (view === 'merge') {
        render();
    } else if (view === 'export') {
        render();
    } else if (view === 'search') {
        render();
    } else if (view === 'ignore') {
        fetchIgnorePatterns();
    } else if (view === 'tools') {
        render();
    } else {
        render();
    }
}

function logToConsole(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    entry.textContent = `[${time}] ${message}`;
    elements.consoleLog.appendChild(entry);
    elements.consoleLog.scrollTop = elements.consoleLog.scrollHeight;
}

function getOperationLabel(cmd) {
    const labels = {
        'checkout': 'Checking out repository...',
        'update': 'Updating files...',
        'commit': 'Committing changes...',
        'revert': 'Reverting changes...',
        'add': 'Adding files...',
        'delete': 'Deleting files...',
        'resolve': 'Resolving conflicts...',
        'status': 'Scanning status...',
        'info': 'Fetching info...',
        'log': 'Fetching log...',
        'diff': 'Loading diff...',
        'proplist': 'Loading properties...',
        'propget': 'Reading property...',
        'propset': 'Setting property...',
        'propdel': 'Deleting property...',
        'ls': 'Listing...',
        'copy': 'Copying...',
        'switch': 'Switching branch...',
        'lock': 'Locking file...',
        'unlock': 'Unlocking file...',
        'blame': 'Loading blame data...',
        'merge': 'Merging...',
        'export': 'Exporting...',
        'import': 'Importing...',
        'cleanup': 'Cleaning up...',
        'move': 'Moving/Renaming...',
        'relocate': 'Relocating...',
        'changelist': 'Updating changelist...',
        'patch': 'Applying patch...'
    };
    return labels[cmd] || `Running svn ${cmd}...`;
}

function showOperation(label) {
    state.currentOperation = label;
    const overlay = document.getElementById('operation-overlay');
    const labelEl = document.getElementById('operation-label');
    if (overlay && labelEl) {
        labelEl.textContent = label;
        overlay.classList.remove('hidden');
    }
    document.querySelector('.app-container').classList.add('operation-active');
}

function hideOperation() {
    state.currentOperation = null;
    const overlay = document.getElementById('operation-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    document.querySelector('.app-container').classList.remove('operation-active');
}

async function runSvn(command, url = null) {
    if (state.currentOperation) return false;

    // checkout 명령은 cwd 불필요 (새 경로에 체크아웃하므로)
    const isCheckout = command[0] === 'checkout';
    const cwd = isCheckout ? null : (state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].path : null);
    const finalUrl = url || (state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].url : null);

    showOperation(getOperationLabel(command[0]));
    logToConsole(`Executing: svn ${command.join(' ')}`, 'system');

    try {
        const result = await window.api.runSvn(command, cwd, finalUrl);

        if (result.success) {
            logToConsole('Command completed successfully.', 'success');
            hideOperation();
            if (!isCheckout) refreshStatus();
            return true;
        } else {
            hideOperation();
            const errorStr = (result.error || '') + (result.output || '');
            if (errorStr.includes('Authentication failed') || errorStr.includes('Authorization failed') || errorStr.includes('Username not found')) {
                logToConsole('Authentication required. Opening login window...', 'warning');
                state.lastFailedCommand = { command, url: finalUrl };
                document.getElementById('auth-url').value = finalUrl || 'global';
                elements.authModal.classList.remove('hidden');
            } else if (errorStr.includes('E155007')) {
                logToConsole('Error: This folder is not a valid SVN working copy. Please run "Checkout" first.', 'error');
            } else {
                logToConsole(`Error: ${errorStr}`, 'error');
            }
            return false;
        }
    } catch (err) {
        hideOperation();
        logToConsole(`Failed: ${err.message}`, 'error');
        return false;
    }
}

async function deleteFile(path) {
    if (state.currentOperation) return;

    const cwd = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].path : null;
    showOperation('Deleting file...');
    logToConsole(`Deleting unversioned file: ${path}`, 'warning');

    try {
        const result = await window.api.deleteFile(path, cwd);
        hideOperation();
        if (result.success) {
            logToConsole('File deleted.', 'success');
            refreshStatus();
        } else {
            logToConsole(`Delete Error: ${result.error}`, 'error');
        }
    } catch (err) {
        hideOperation();
        logToConsole(`Failed: ${err.message}`, 'error');
    }
}

async function refreshStatus() {
    if (state.selectedProjectIndex === -1 && state.projects.length > 0) return;
    state.isScanning = true;
    state.selectedFiles.clear();
    updateBulkUI();
    showOperation('Scanning status...');
    render();

    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        state.isScanning = false;
        hideOperation();
        render();
        return;
    }

    try {
        const result = await window.api.runSvn(['status'], project.path, project.url);
        if (result.success) {
            const lines = result.output.split('\n').filter(l => l.trim());
            state.workingCopy = lines.map(line => {
                const statusChar = line[0];
                const path = line.substring(8).trim();
                let status = 'modified';
                if (statusChar === 'A') status = 'added';
                if (statusChar === 'D') status = 'deleted';
                if (statusChar === 'M') status = 'modified';
                if (statusChar === '?') status = 'untracked';
                if (statusChar === 'C') status = 'conflict';
                if (statusChar === '!') status = 'missing';
                return { path, status };
            });
        } else {
            state.workingCopy = [];
            if (result.error.includes('Authentication')) runSvn(['status'], project.url);
        }
    } finally {
        state.isScanning = false;
        hideOperation();
        render();
    }
}

function toggleFileSelection(path) {
    if (state.selectedFiles.has(path)) {
        state.selectedFiles.delete(path);
    } else {
        state.selectedFiles.add(path);
    }
    updateBulkUI();
}

function updateBulkUI() {
    if (state.selectedFiles.size > 0) {
        elements.bulkActions.classList.remove('hidden');
        elements.selectedCount.textContent = `${state.selectedFiles.size} files selected`;
    } else {
        elements.bulkActions.classList.add('hidden');
    }
}

function openCommitModal() {
    const list = document.getElementById('commit-file-list');
    list.innerHTML = Array.from(state.selectedFiles).map(f => `<div>• ${f}</div>`).join('');
    elements.modalContainer.classList.remove('hidden');
}

function render() {
    if (state.selectedProjectIndex === -1 && state.projects.length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>No projects yet. Click + to Checkout a new project.</p></div>`;
        return;
    }
    if (state.isScanning) {
        elements.contentArea.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div><p>Syncing...</p></div>`;
        return;
    }
    switch (state.currentView) {
        case 'status':
            renderStatus();
            break;
        case 'commit-view':
            renderCommitView();
            break;
        case 'revert-view':
            renderRevertView();
            break;
        case 'log':
            renderLog();
            break;
        case 'auth':
            renderAuthManager();
            break;
        case 'tree':
            renderTree();
            break;
        case 'properties':
            renderProperties();
            break;
        case 'branch':
            renderBranch();
            break;
        case 'lock':
            renderLockView();
            break;
        case 'blame':
            renderBlameView();
            break;
        case 'merge':
            renderMergeView();
            break;
        case 'export':
            renderExportImportView();
            break;
        case 'search':
            renderSearchView();
            break;
        case 'ignore':
            renderIgnoreView();
            break;
        case 'tools':
            renderToolsView();
            break;
        case 'settings':
            renderSettings();
            break;
        default:
            elements.contentArea.innerHTML = `<div class="empty-state"><p>View not found.</p></div>`;
    }
}

function renderStatus() {
    if (state.workingCopy.length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>Workspace is clean.</p></div>`;
        return;
    }
    let html = '<div class="status-list">';
    state.workingCopy.forEach((file, index) => {
        const isSelected = state.selectedFiles.has(file.path);
        const ep = escapePath(file.path);
        html += `
            <div class="status-card ${isSelected ? 'selected' : ''}" style="animation-delay: ${index * 0.05}s" onclick="toggleFileSelection('${ep}'); render();">
                <div class="file-info">
                    <label class="checkbox-container" onclick="event.stopPropagation()">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${ep}'); render();">
                        <span class="checkmark"></span>
                    </label>
                    <span class="file-badge badge-${file.status}">${file.status.charAt(0)}</span>
                    <span class="file-path">${escapeHtml(file.path)}</span>
                </div>
                <div class="file-actions" onclick="event.stopPropagation()">
                    ${file.status === 'untracked' ?
                `<button class="btn-primary" onclick="runSvn(['add', '${ep}'])">Add</button>
                         <button class="btn-secondary" onclick="if(confirm('Delete ${ep}?')) deleteFile('${ep}')">Delete</button>` :
                file.status === 'conflict' ?
                `<button class="btn-secondary" onclick="showDiff('${ep}')">Diff</button>
                         <button class="btn-primary" onclick="runSvn(['resolve', '--accept', 'working', '${ep}'])">Resolve (mine)</button>
                         <button class="btn-secondary" onclick="runSvn(['resolve', '--accept', 'theirs-full', '${ep}'])">Resolve (theirs)</button>
                         <button class="btn-secondary" onclick="if(confirm('Revert ${ep}?')) runSvn(['revert', '-R', '${ep}'])">Revert</button>` :
                `<button class="btn-secondary" onclick="showDiff('${ep}')">Diff</button>
                         <button class="btn-secondary" onclick="if(confirm('Revert ${ep}?')) runSvn(['revert', '-R', '${ep}'])">Revert</button>`
            }
                </div>
            </div>
        `;
    });
    html += '</div>';
    elements.contentArea.innerHTML = html;
}

// === Log View ===
async function fetchLog() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    state.isScanning = true;
    render();

    const limit = state.logPage * state.logLimit;
    const success = await runSvnSilent(['log', '-l', String(limit), '-v']);
    state.isScanning = false;

    if (success) {
        parseLogEntries(success.output || '');
    } else {
        state.logEntries = [];
    }
    render();
}

async function runSvnSilent(command) {
    const cwd = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].path : null;
    const url = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].url : null;

    showOperation(getOperationLabel(command[0]));

    try {
        const result = await window.api.runSvn(command, cwd, url);
        hideOperation();
        if (result.success) return result;
        logToConsole(`Error: ${result.error || ''}`, 'error');
        return null;
    } catch (err) {
        hideOperation();
        logToConsole(`Failed: ${err.message}`, 'error');
        return null;
    }
}

function parseLogEntries(output) {
    const entries = [];
    const blocks = output.split(/^-{4,}$/m).filter(b => b.trim());

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length === 0) continue;

        const headerMatch = lines[0].match(/^r(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
        if (!headerMatch) continue;

        const revision = headerMatch[1];
        const author = headerMatch[2];
        const dateStr = headerMatch[3].trim();

        let changedPaths = [];
        let message = '';
        let inPaths = false;
        let inMsg = false;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('Changed paths:')) {
                inPaths = true;
                inMsg = false;
                continue;
            }
            if (line.trim() === '' && inPaths) {
                inPaths = false;
                inMsg = true;
                continue;
            }
            if (inPaths) {
                const pathMatch = line.trim().match(/^([ADMR])\s+(.+)/);
                if (pathMatch) {
                    changedPaths.push({ action: pathMatch[1], path: pathMatch[2] });
                }
            } else if (inMsg || (!inPaths && i > 0)) {
                if (line.trim() !== '' || message) {
                    message += (message ? '\n' : '') + line;
                }
            }
        }

        entries.push({
            revision,
            author,
            date: dateStr,
            message: message.trim(),
            changedPaths
        });
    }
    state.logEntries = entries;
}

// === Log Filter ===
let _logFilterTimer = null;

function debounceLogFilter() {
    clearTimeout(_logFilterTimer);
    _logFilterTimer = setTimeout(() => applyLogFilter(), 300);
}

function applyLogFilter() {
    const keyword = document.getElementById('log-filter-keyword');
    const author = document.getElementById('log-filter-author');
    const dateFrom = document.getElementById('log-filter-date-from');
    const dateTo = document.getElementById('log-filter-date-to');

    state.logFilter.keyword = keyword ? keyword.value.trim() : '';
    state.logFilter.author = author ? author.value.trim() : '';
    state.logFilter.dateFrom = dateFrom ? dateFrom.value : '';
    state.logFilter.dateTo = dateTo ? dateTo.value : '';

    render();
}

function clearLogFilter() {
    state.logFilter = { keyword: '', author: '', dateFrom: '', dateTo: '' };
    render();
}

function parseSvnDate(dateStr) {
    // SVN date format: "2024-01-15 10:30:00 +0900 (Mon, 15 Jan 2024)"
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function getFilteredLogEntries() {
    let entries = state.logEntries;
    const { keyword, author, dateFrom, dateTo } = state.logFilter;

    if (keyword) {
        const kw = keyword.toLowerCase();
        entries = entries.filter(e =>
            ('r' + e.revision).toLowerCase().includes(kw) ||
            e.message.toLowerCase().includes(kw) ||
            e.changedPaths.some(p => p.path.toLowerCase().includes(kw))
        );
    }

    if (author) {
        const a = author.toLowerCase();
        entries = entries.filter(e => e.author.toLowerCase().includes(a));
    }

    if (dateFrom) {
        entries = entries.filter(e => {
            const d = parseSvnDate(e.date);
            return d && d >= dateFrom;
        });
    }

    if (dateTo) {
        entries = entries.filter(e => {
            const d = parseSvnDate(e.date);
            return d && d <= dateTo;
        });
    }

    return entries;
}

function renderLog() {
    if (state.logEntries.length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>No log entries found.</p></div>`;
        return;
    }

    const filtered = getFilteredLogEntries();
    const hasFilter = state.logFilter.keyword || state.logFilter.author || state.logFilter.dateFrom || state.logFilter.dateTo;

    let html = '';

    // Filter bar
    html += `<div class="log-filter-bar">
        <div class="log-filter-row">
            <div class="log-filter-group">
                <input type="text" id="log-filter-keyword" class="log-filter-input" placeholder="Search keyword..." value="${escapeHtml(state.logFilter.keyword)}" oninput="debounceLogFilter()">
            </div>
            <div class="log-filter-group">
                <input type="text" id="log-filter-author" class="log-filter-input log-filter-author" placeholder="Author..." value="${escapeHtml(state.logFilter.author)}" oninput="debounceLogFilter()">
            </div>
            <div class="log-filter-group log-filter-date-group">
                <input type="date" id="log-filter-date-from" class="log-filter-input log-filter-date" value="${state.logFilter.dateFrom}" onchange="applyLogFilter()">
                <span class="log-filter-separator">~</span>
                <input type="date" id="log-filter-date-to" class="log-filter-input log-filter-date" value="${state.logFilter.dateTo}" onchange="applyLogFilter()">
            </div>
            <button class="btn-secondary btn-small" onclick="clearLogFilter()" ${hasFilter ? '' : 'disabled'}>Clear</button>
        </div>
        ${hasFilter ? `<div class="log-filter-results">Showing ${filtered.length} of ${state.logEntries.length} entries</div>` : ''}
    </div>`;

    // Log list
    html += '<div class="log-list">';
    if (filtered.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>No matching entries found.</p></div>`;
    } else {
        for (const entry of filtered) {
            const shortDate = entry.date.split('(')[0].trim();
            html += `
                <div class="log-card" onclick="this.querySelector('.log-details').classList.toggle('hidden')">
                    <div class="log-header">
                        <div class="log-revision">r${entry.revision}</div>
                        <div class="log-meta">
                            <span class="log-author">${escapeHtml(entry.author)}</span>
                            <span class="log-date">${escapeHtml(shortDate)}</span>
                        </div>
                    </div>
                    <div class="log-message">${escapeHtml(entry.message || '(no message)')}</div>
                    <div class="log-details hidden">
                        <div class="log-paths-title">Changed Files (${entry.changedPaths.length}):</div>
                        ${entry.changedPaths.map(p => `
                            <div class="log-path-item">
                                <span class="file-badge badge-${actionToStatus(p.action)}">${p.action}</span>
                                <span>${escapeHtml(p.path)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }
    html += `<div class="log-load-more"><button class="btn-secondary" onclick="state.logPage++; fetchLog();">Load More</button></div>`;
    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function actionToStatus(action) {
    const map = { 'A': 'added', 'D': 'deleted', 'M': 'modified', 'R': 'modified' };
    return map[action] || 'modified';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapePath(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// === Commit View ===
function renderCommitView() {
    if (!state.workingCopy || state.workingCopy.length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>Workspace is clean. Nothing to commit.</p></div>`;
        return;
    }

    const committable = state.workingCopy.filter(f => f.status !== 'untracked');
    const untracked = state.workingCopy.filter(f => f.status === 'untracked');

    let html = '<div class="commit-view-container">';

    if (untracked.length > 0) {
        html += `<div class="section-label">Untracked Files (must 'Add' before committing)</div>`;
        html += '<div class="status-list">';
        untracked.forEach(file => {
            html += `
                <div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-untracked">?</span>
                        <span class="file-path">${file.path}</span>
                    </div>
                    <div class="file-actions">
                        <button class="btn-primary" onclick="runSvn(['add', '${file.path}'])">Add</button>
                    </div>
                </div>`;
        });
        html += '</div>';
    }

    if (committable.length > 0) {
        html += `<div class="section-label">Committable Files</div>`;
        html += '<div class="status-list">';
        committable.forEach((file, index) => {
            const isSelected = state.selectedFiles.has(file.path);
            html += `
                <div class="status-card ${isSelected ? 'selected' : ''}" style="animation-delay: ${index * 0.05}s" onclick="toggleFileSelection('${file.path}'); render();">
                    <div class="file-info">
                        <label class="checkbox-container" onclick="event.stopPropagation()">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${file.path}'); render();">
                            <span class="checkmark"></span>
                        </label>
                        <span class="file-badge badge-${file.status}">${file.status.charAt(0).toUpperCase()}</span>
                        <span class="file-path">${file.path}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary" onclick="showDiff('${file.path}')">Diff</button>
                    </div>
                </div>`;
        });
        html += '</div>';

        // Changelist options
        const clNames = Object.keys(state.changelists);
        let clOptions = '';
        if (clNames.length > 0) {
            clOptions = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                <span style="color: var(--text-dim); font-size: 13px;">Commit changelist:</span>
                ${clNames.map(cl => `<button class="btn-secondary btn-small" onclick="commitChangelist('${escapeHtml(cl)}')">${escapeHtml(cl)} (${state.changelists[cl].length})</button>`).join('')}
            </div>`;
        }

        html += `
            <div class="commit-form">
                ${clOptions}
                <textarea id="inline-commit-message" class="commit-textarea" placeholder="Enter commit message..."></textarea>
                <div class="commit-form-actions">
                    <button class="btn-secondary" onclick="selectAllCommittable()">Select All</button>
                    <button class="btn-primary" onclick="inlineCommit()">Commit Selected (${state.selectedFiles.size})</button>
                </div>
            </div>`;
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function selectAllCommittable() {
    const committable = state.workingCopy.filter(f => f.status !== 'untracked');
    if (state.selectedFiles.size === committable.length) {
        state.selectedFiles.clear();
    } else {
        committable.forEach(f => state.selectedFiles.add(f.path));
    }
    updateBulkUI();
    render();
}

async function inlineCommit() {
    const msgEl = document.getElementById('inline-commit-message');
    const msg = msgEl ? msgEl.value.trim() : '';
    if (!msg) return alert('Please enter a commit message.');
    if (state.selectedFiles.size === 0) return alert('Please select files to commit.');

    const files = Array.from(state.selectedFiles);
    const success = await runSvn(['commit', '-m', msg, ...files]);
    if (success) {
        state.selectedFiles.clear();
        updateBulkUI();
    }
}

// === Revert View ===
function renderRevertView() {
    if (!state.workingCopy || state.workingCopy.length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>Workspace is clean. Nothing to revert.</p></div>`;
        return;
    }

    const revertable = state.workingCopy.filter(f => f.status !== 'untracked');
    const untracked = state.workingCopy.filter(f => f.status === 'untracked');

    let html = '<div class="revert-view-container">';

    if (revertable.length > 0) {
        html += `<div class="section-label">Modified Files (can be reverted)</div>`;
        html += '<div class="status-list">';
        revertable.forEach((file, index) => {
            const isSelected = state.selectedFiles.has(file.path);
            html += `
                <div class="status-card ${isSelected ? 'selected' : ''}" style="animation-delay: ${index * 0.05}s" onclick="toggleFileSelection('${file.path}'); render();">
                    <div class="file-info">
                        <label class="checkbox-container" onclick="event.stopPropagation()">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${file.path}'); render();">
                            <span class="checkmark"></span>
                        </label>
                        <span class="file-badge badge-${file.status}">${file.status.charAt(0).toUpperCase()}</span>
                        <span class="file-path">${file.path}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary" onclick="showDiff('${file.path}')">Diff</button>
                        <button class="btn-secondary" style="color: var(--error);" onclick="if(confirm('Revert ${file.path}?')) runSvn(['revert', '-R', '${file.path}'])">Revert</button>
                    </div>
                </div>`;
        });
        html += '</div>';

        html += `
            <div class="commit-form">
                <div class="commit-form-actions">
                    <button class="btn-secondary" onclick="selectAllRevertable()">Select All</button>
                    <button class="btn-primary" style="background: linear-gradient(135deg, var(--error), #b91c1c);" onclick="bulkRevert()">Revert Selected (${state.selectedFiles.size})</button>
                </div>
            </div>`;
    }

    if (untracked.length > 0) {
        html += `<div class="section-label">Untracked Files (can be deleted)</div>`;
        html += '<div class="status-list">';
        untracked.forEach(file => {
            html += `
                <div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-untracked">?</span>
                        <span class="file-path">${file.path}</span>
                    </div>
                    <div class="file-actions">
                        <button class="btn-secondary" style="color: var(--error);" onclick="if(confirm('Delete ${file.path}?')) deleteFile('${file.path}')">Delete</button>
                    </div>
                </div>`;
        });
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function selectAllRevertable() {
    const revertable = state.workingCopy.filter(f => f.status !== 'untracked');
    if (state.selectedFiles.size === revertable.length) {
        state.selectedFiles.clear();
    } else {
        revertable.forEach(f => state.selectedFiles.add(f.path));
    }
    updateBulkUI();
    render();
}

async function bulkRevert() {
    if (state.selectedFiles.size === 0) return alert('Please select files to revert.');
    if (!confirm(`Are you sure you want to revert ${state.selectedFiles.size} files? This cannot be undone.`)) return;
    await runSvn(['revert', '-R', ...Array.from(state.selectedFiles)]);
    state.selectedFiles.clear();
    updateBulkUI();
}

// === Diff Viewer ===
let lastDiffRawOutput = '';

async function showDiff(filePath) {
    const cwd = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].path : null;
    const url = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].url : null;

    elements.diffModalTitle.textContent = `Diff — ${filePath}`;
    elements.diffContent.innerHTML = '<div class="diff-empty"><div class="loading-spinner"></div></div>';
    elements.diffModal.classList.remove('hidden');

    try {
        const result = await window.api.runSvn(['diff', filePath], cwd, url);
        if (result.success) {
            lastDiffRawOutput = result.output || '';
            if (!lastDiffRawOutput.trim()) {
                elements.diffContent.innerHTML = '<div class="diff-empty">No changes detected.</div>';
            } else {
                renderDiffContent();
            }
        } else {
            elements.diffContent.innerHTML = `<div class="diff-empty" style="color: var(--error);">Error: ${escapeHtml(result.error || 'Unknown error')}</div>`;
        }
    } catch (err) {
        elements.diffContent.innerHTML = `<div class="diff-empty" style="color: var(--error);">Failed: ${escapeHtml(err.message)}</div>`;
    }
}

function renderDiffContent() {
    if (state.diffMode === 'side-by-side') {
        elements.diffContent.innerHTML = parseDiffSideBySide(lastDiffRawOutput);
    } else {
        elements.diffContent.innerHTML = parseDiffOutput(lastDiffRawOutput);
    }
    // Update toggle button states
    document.querySelectorAll('.diff-mode-toggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.diffMode);
    });
    // Toggle modal width class
    const card = document.querySelector('.diff-modal-card');
    if (card) card.classList.toggle('diff-modal-wide', state.diffMode === 'side-by-side');
}

function toggleDiffMode(mode) {
    state.diffMode = mode;
    if (lastDiffRawOutput.trim()) {
        renderDiffContent();
    }
}

function parseDiffOutput(raw) {
    const lines = raw.split('\n');
    let html = '';
    let oldLineNum = 0;
    let newLineNum = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('Index: ') || line.startsWith('=====')) {
            html += `<div class="diff-file-header">${escapeHtml(line)}</div>`;
            continue;
        }
        if (line.startsWith('--- ')) {
            html += `<div class="diff-file-header old-file">${escapeHtml(line)}</div>`;
            continue;
        }
        if (line.startsWith('+++ ')) {
            html += `<div class="diff-file-header new-file">${escapeHtml(line)}</div>`;
            continue;
        }

        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) {
                oldLineNum = parseInt(match[1]);
                newLineNum = parseInt(match[2]);
            }
            html += `<div class="diff-section-header">${escapeHtml(line)}</div>`;
            continue;
        }

        if (line.startsWith('-') && !line.startsWith('---')) {
            let removeCount = 0;
            let addCount = 0;
            let j = i;
            while (j < lines.length && lines[j].startsWith('-') && !lines[j].startsWith('---')) {
                removeCount++;
                j++;
            }
            while (j < lines.length && lines[j].startsWith('+') && !lines[j].startsWith('+++')) {
                addCount++;
                j++;
            }

            if (removeCount > 0 && addCount > 0) {
                const maxPairs = Math.min(removeCount, addCount);

                for (let k = 0; k < maxPairs; k++) {
                    const rmLine = lines[i + k];
                    html += `<div class="diff-line changed">
                        <span class="diff-line-num">${oldLineNum}</span>
                        <span class="diff-line-content">${escapeHtml(rmLine)}</span>
                    </div>`;
                    oldLineNum++;
                }
                for (let k = 0; k < maxPairs; k++) {
                    const addLine = lines[i + removeCount + k];
                    html += `<div class="diff-line changed">
                        <span class="diff-line-num">${newLineNum}</span>
                        <span class="diff-line-content">${escapeHtml(addLine)}</span>
                    </div>`;
                    newLineNum++;
                }

                for (let k = maxPairs; k < removeCount; k++) {
                    const rmLine = lines[i + k];
                    html += `<div class="diff-line removed">
                        <span class="diff-line-num">${oldLineNum}</span>
                        <span class="diff-line-content">${escapeHtml(rmLine)}</span>
                    </div>`;
                    oldLineNum++;
                }

                for (let k = maxPairs; k < addCount; k++) {
                    const addLine = lines[i + removeCount + k];
                    html += `<div class="diff-line added">
                        <span class="diff-line-num">${newLineNum}</span>
                        <span class="diff-line-content">${escapeHtml(addLine)}</span>
                    </div>`;
                    newLineNum++;
                }

                i += removeCount + addCount - 1;
                continue;
            }

            html += `<div class="diff-line removed">
                <span class="diff-line-num">${oldLineNum}</span>
                <span class="diff-line-content">${escapeHtml(line)}</span>
            </div>`;
            oldLineNum++;
            continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
            html += `<div class="diff-line added">
                <span class="diff-line-num">${newLineNum}</span>
                <span class="diff-line-content">${escapeHtml(line)}</span>
            </div>`;
            newLineNum++;
            continue;
        }

        if (line.startsWith(' ') || (line.length > 0 && !line.startsWith('\\') && !line.startsWith('Property'))) {
            html += `<div class="diff-line context">
                <span class="diff-line-num">${newLineNum}</span>
                <span class="diff-line-content">${escapeHtml(line)}</span>
            </div>`;
            oldLineNum++;
            newLineNum++;
            continue;
        }

        if (line.startsWith('\\') || line.startsWith('Property')) {
            html += `<div class="diff-file-header">${escapeHtml(line)}</div>`;
            continue;
        }
    }

    return html;
}

function parseDiffSideBySide(raw) {
    const lines = raw.split('\n');
    let html = '';
    let oldLineNum = 0;
    let newLineNum = 0;

    function sbsRow(type, oldNum, oldCode, newNum, newCode) {
        const ln = (n) => n ? `<span class="diff-sbs-num">${n}</span>` : '<span class="diff-sbs-num"></span>';
        const leftCls = (type === 'removed' || type === 'changed') ? ` diff-sbs-${type}` : (type === 'added' ? ' diff-sbs-empty' : '');
        const rightCls = (type === 'added' || type === 'changed') ? ` diff-sbs-${type}` : (type === 'removed' ? ' diff-sbs-empty' : '');
        return `<div class="diff-sbs-row ${type}">
            <div class="diff-sbs-left${leftCls}">${ln(oldNum)}<span class="diff-sbs-code">${oldCode}</span></div>
            <div class="diff-sbs-right${rightCls}">${ln(newNum)}<span class="diff-sbs-code">${newCode}</span></div>
        </div>`;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('Index: ') || line.startsWith('=====')) {
            html += `<div class="diff-file-header">${escapeHtml(line)}</div>`;
            continue;
        }
        if (line.startsWith('--- ')) {
            html += `<div class="diff-file-header old-file">${escapeHtml(line)}</div>`;
            continue;
        }
        if (line.startsWith('+++ ')) {
            html += `<div class="diff-file-header new-file">${escapeHtml(line)}</div>`;
            continue;
        }

        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) {
                oldLineNum = parseInt(match[1]);
                newLineNum = parseInt(match[2]);
            }
            html += `<div class="diff-section-header">${escapeHtml(line)}</div>`;
            continue;
        }

        if (line.startsWith('-') && !line.startsWith('---')) {
            let removeCount = 0;
            let addCount = 0;
            let j = i;
            while (j < lines.length && lines[j].startsWith('-') && !lines[j].startsWith('---')) { removeCount++; j++; }
            while (j < lines.length && lines[j].startsWith('+') && !lines[j].startsWith('+++')) { addCount++; j++; }

            if (removeCount > 0 && addCount > 0) {
                const maxPairs = Math.min(removeCount, addCount);

                for (let k = 0; k < maxPairs; k++) {
                    html += sbsRow('changed', oldLineNum, escapeHtml(lines[i + k].substring(1)), newLineNum, escapeHtml(lines[i + removeCount + k].substring(1)));
                    oldLineNum++;
                    newLineNum++;
                }

                for (let k = maxPairs; k < removeCount; k++) {
                    html += sbsRow('removed', oldLineNum, escapeHtml(lines[i + k].substring(1)), '', '');
                    oldLineNum++;
                }

                for (let k = maxPairs; k < addCount; k++) {
                    html += sbsRow('added', '', '', newLineNum, escapeHtml(lines[i + removeCount + k].substring(1)));
                    newLineNum++;
                }

                i += removeCount + addCount - 1;
                continue;
            }

            html += sbsRow('removed', oldLineNum, escapeHtml(line.substring(1)), '', '');
            oldLineNum++;
            continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
            html += sbsRow('added', '', '', newLineNum, escapeHtml(line.substring(1)));
            newLineNum++;
            continue;
        }

        if (line.startsWith(' ') || (line.length > 0 && !line.startsWith('\\') && !line.startsWith('Property'))) {
            const content = line.startsWith(' ') ? line.substring(1) : line;
            html += sbsRow('context', oldLineNum, escapeHtml(content), newLineNum, escapeHtml(content));
            oldLineNum++;
            newLineNum++;
            continue;
        }

        if (line.startsWith('\\') || line.startsWith('Property')) {
            html += `<div class="diff-file-header">${escapeHtml(line)}</div>`;
            continue;
        }
    }

    return html;
}

// === Auth Manager ===
async function fetchAuthEntries() {
    try {
        const authData = await window.api.loadAuth();
        state.authEntries = Object.entries(authData).map(([key, val]) => ({
            urlKey: key,
            username: val.username || ''
        }));
    } catch (err) {
        logToConsole(`Failed to load credentials: ${err.message}`, 'error');
        state.authEntries = [];
    }
    state.editingAuthKey = null;
    render();
}

function renderAuthManager() {
    let html = '<div class="auth-manager-container">';

    html += `
        <div class="section-label">Add Credentials</div>
        <div class="auth-form">
            <div class="auth-form-row">
                <input type="text" id="auth-new-url" class="auth-form-input" placeholder="Repository URL or 'global'">
                <input type="text" id="auth-new-username" class="auth-form-input" placeholder="Username">
                <input type="password" id="auth-new-password" class="auth-form-input" placeholder="Password">
                <button class="btn-primary btn-small" onclick="saveNewAuth()">Save</button>
            </div>
        </div>`;

    html += `<div class="section-label">Saved Credentials (${state.authEntries.length})</div>`;

    if (state.authEntries.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>No saved credentials.</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const entry of state.authEntries) {
            const isEditing = state.editingAuthKey === entry.urlKey;

            if (isEditing) {
                html += `
                    <div class="status-card auth-card auth-card-editing">
                        <div class="auth-edit-form">
                            <div class="auth-edit-row">
                                <span class="auth-url-badge">${escapeHtml(entry.urlKey)}</span>
                                <input type="text" id="auth-edit-username" class="auth-form-input" placeholder="Username" value="${escapeHtml(entry.username)}">
                                <input type="password" id="auth-edit-password" class="auth-form-input" placeholder="New password">
                            </div>
                            <div class="auth-edit-actions">
                                <button class="btn-primary btn-small" onclick="updateAuth('${escapeHtml(entry.urlKey)}')">Save</button>
                                <button class="btn-secondary btn-small" onclick="cancelEditAuth()">Cancel</button>
                            </div>
                        </div>
                    </div>`;
            } else {
                html += `
                    <div class="status-card auth-card">
                        <div class="file-info">
                            <span class="auth-url-badge">${escapeHtml(entry.urlKey)}</span>
                            <span class="auth-username">${escapeHtml(entry.username)}</span>
                        </div>
                        <div class="file-actions" onclick="event.stopPropagation()">
                            <button class="btn-secondary btn-small" onclick="testAuth('${escapeHtml(entry.urlKey)}')">Check</button>
                            <button class="btn-secondary btn-small" onclick="editAuth('${escapeHtml(entry.urlKey)}')">Edit</button>
                            <button class="btn-secondary btn-small" style="color: var(--error);" onclick="deleteAuthEntry('${escapeHtml(entry.urlKey)}')">Delete</button>
                        </div>
                    </div>`;
            }
        }
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

async function saveNewAuth() {
    const url = document.getElementById('auth-new-url').value.trim();
    const username = document.getElementById('auth-new-username').value.trim();
    const password = document.getElementById('auth-new-password').value;

    if (!url || !username || !password) {
        return alert('Please fill in all fields.');
    }

    try {
        const result = await window.api.saveAuth({ url, username, password });
        if (result.success) {
            logToConsole(`Credentials saved for: ${url}`, 'success');
            fetchAuthEntries();
        }
    } catch (err) {
        logToConsole(`Failed to save credentials: ${err.message}`, 'error');
    }
}

function editAuth(urlKey) {
    state.editingAuthKey = urlKey;
    render();
}

function cancelEditAuth() {
    state.editingAuthKey = null;
    render();
}

async function updateAuth(urlKey) {
    const username = document.getElementById('auth-edit-username').value.trim();
    const password = document.getElementById('auth-edit-password').value;

    if (!username) return alert('Username is required.');
    if (!password) return alert('Please enter a new password.');

    try {
        const result = await window.api.saveAuth({ url: urlKey, username, password });
        if (result.success) {
            logToConsole(`Credentials updated for: ${urlKey}`, 'success');
            fetchAuthEntries();
        }
    } catch (err) {
        logToConsole(`Failed to update credentials: ${err.message}`, 'error');
    }
}

async function deleteAuthEntry(urlKey) {
    if (!confirm(`Delete credentials for '${urlKey}'?`)) return;

    try {
        const result = await window.api.deleteAuth(urlKey);
        if (result.success) {
            logToConsole(`Credentials deleted: ${urlKey}`, 'success');
            fetchAuthEntries();
        } else {
            logToConsole(`Delete failed: ${result.error}`, 'error');
        }
    } catch (err) {
        logToConsole(`Failed to delete credentials: ${err.message}`, 'error');
    }
}

async function testAuth(urlKey) {
    if (state.currentOperation) return;

    const url = urlKey === 'global' ? (state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].url : null) : urlKey;

    if (!url) {
        logToConsole('Cannot test "global" without an active project URL.', 'warning');
        return;
    }

    showOperation('Testing connection...');
    logToConsole(`Testing credentials for: ${url}...`, 'system');

    try {
        const result = await window.api.runSvn(['info', url], null, url);
        hideOperation();
        if (result.success) {
            logToConsole(`Connection successful for: ${url}`, 'success');
        } else {
            logToConsole(`Connection failed: ${result.error || 'Unknown error'}`, 'error');
        }
    } catch (err) {
        hideOperation();
        logToConsole(`Test failed: ${err.message}`, 'error');
    }
}

function copyDiffToClipboard() {
    if (!lastDiffRawOutput) return;
    navigator.clipboard.writeText(lastDiffRawOutput).then(() => {
        logToConsole('Diff copied to clipboard.', 'success');
    }).catch(() => {
        logToConsole('Failed to copy diff.', 'error');
    });
}

// === Tree View ===
async function fetchTree() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        render();
        return;
    }

    const rootPath = project.path;
    try {
        const result = await window.api.listDirectory(rootPath);
        if (result.success) {
            state.treeData[rootPath] = result.items;
            state.treeExpanded.add(rootPath);
        } else {
            logToConsole(`Failed to read directory: ${result.error}`, 'error');
            state.treeData[rootPath] = [];
        }
    } catch (err) {
        logToConsole(`Tree error: ${err.message}`, 'error');
        state.treeData[rootPath] = [];
    }
    render();
}

async function toggleTreeFolder(dirPath) {
    if (state.treeExpanded.has(dirPath)) {
        state.treeExpanded.delete(dirPath);
    } else {
        try {
            const result = await window.api.listDirectory(dirPath);
            if (result.success) {
                state.treeData[dirPath] = result.items;
            } else {
                state.treeData[dirPath] = [];
                logToConsole(`Cannot read: ${result.error}`, 'error');
            }
        } catch (err) {
            state.treeData[dirPath] = [];
            logToConsole(`Tree error: ${err.message}`, 'error');
        }
        state.treeExpanded.add(dirPath);
    }
    render();
}

async function treeFolderUpdate(dirPath, event) {
    event.stopPropagation();
    await runSvn(['update', dirPath]);
}

async function treeFolderStatus(dirPath, event) {
    event.stopPropagation();
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    showOperation('Scanning status...');
    try {
        const result = await window.api.runSvn(['status', dirPath], project.path, project.url);
        hideOperation();
        if (result.success) {
            const lines = result.output.split('\n').filter(l => l.trim());
            state.treeFolderStatus[dirPath] = lines.map(line => {
                const statusChar = line[0];
                const filePath = line.substring(8).trim();
                let status = 'modified';
                if (statusChar === 'A') status = 'added';
                if (statusChar === 'D') status = 'deleted';
                if (statusChar === 'M') status = 'modified';
                if (statusChar === '?') status = 'untracked';
                if (statusChar === 'C') status = 'conflict';
                if (statusChar === '!') status = 'missing';
                return { path: filePath, status };
            });
            if (state.treeFolderStatus[dirPath].length === 0) {
                logToConsole(`No changes in: ${dirPath}`, 'success');
            }
        } else {
            state.treeFolderStatus[dirPath] = [];
            logToConsole(`Status error: ${result.error || ''}`, 'error');
        }
    } catch (err) {
        hideOperation();
        state.treeFolderStatus[dirPath] = [];
        logToConsole(`Status failed: ${err.message}`, 'error');
    }
    render();
}

function clearTreeFolderStatus(dirPath, event) {
    event.stopPropagation();
    delete state.treeFolderStatus[dirPath];
    render();
}

function renderTree() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    const rootPath = project.path;
    if (!state.treeData[rootPath]) {
        elements.contentArea.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div><p>Loading tree...</p></div>';
        return;
    }

    let html = '<div class="tree-container">';

    const rootName = rootPath.split('/').pop() || rootPath;
    html += `<div class="tree-node tree-node-root" onclick="toggleTreeFolder('${escapeHtml(rootPath)}')">
        <span class="tree-toggle ${state.treeExpanded.has(rootPath) ? 'expanded' : ''}">&#9654;</span>
        <span class="tree-icon">📦</span>
        <span class="tree-name">${escapeHtml(rootName)}</span>
        <div class="tree-actions">
            <button class="btn-secondary btn-small" onclick="treeFolderUpdate('${escapeHtml(rootPath)}', event)">Update</button>
            <button class="btn-secondary btn-small" onclick="treeFolderStatus('${escapeHtml(rootPath)}', event)">Status</button>
        </div>
    </div>`;

    if (state.treeFolderStatus[rootPath] && state.treeFolderStatus[rootPath].length > 0) {
        html += renderTreeStatusList(rootPath);
    }

    if (state.treeExpanded.has(rootPath)) {
        html += renderTreeChildren(rootPath, 1);
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function renderTreeChildren(parentPath, depth) {
    const items = state.treeData[parentPath];
    if (!items || items.length === 0) return '';

    let html = '';
    const indent = depth * 24;

    for (const item of items) {
        const safePath = escapeHtml(item.path);

        if (item.type === 'directory') {
            const isExpanded = state.treeExpanded.has(item.path);
            html += `<div class="tree-node" style="padding-left: ${indent}px" onclick="toggleTreeFolder('${safePath}')">
                <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">&#9654;</span>
                <span class="tree-icon">${isExpanded ? '📂' : '📁'}</span>
                <span class="tree-name">${escapeHtml(item.name)}</span>
                <div class="tree-actions">
                    <button class="btn-secondary btn-small" onclick="treeFolderUpdate('${safePath}', event)">Update</button>
                    <button class="btn-secondary btn-small" onclick="treeFolderStatus('${safePath}', event)">Status</button>
                </div>
            </div>`;

            if (state.treeFolderStatus[item.path] && state.treeFolderStatus[item.path].length > 0) {
                html += renderTreeStatusList(item.path, indent);
            }

            if (isExpanded) {
                html += renderTreeChildren(item.path, depth + 1);
            }
        } else {
            html += `<div class="tree-node tree-node-file" style="padding-left: ${indent}px">
                <span class="tree-toggle"></span>
                <span class="tree-icon">📄</span>
                <span class="tree-name file">${escapeHtml(item.name)}</span>
            </div>`;
        }
    }

    return html;
}

function renderTreeStatusList(dirPath, indent) {
    const statusItems = state.treeFolderStatus[dirPath];
    if (!statusItems || statusItems.length === 0) return '';

    const padLeft = (indent || 0) + 44;
    let html = `<div class="tree-status-list" style="padding-left: ${padLeft}px">
        <div class="tree-status-header">
            <span>${statusItems.length} changed file${statusItems.length !== 1 ? 's' : ''}</span>
            <button class="btn-secondary btn-small tree-status-close" onclick="clearTreeFolderStatus('${escapeHtml(dirPath)}', event)">×</button>
        </div>`;

    for (const item of statusItems) {
        html += `<div class="tree-status-item">
            <span class="file-badge badge-${item.status}">${item.status.charAt(0).toUpperCase()}</span>
            <span>${escapeHtml(item.path)}</span>
        </div>`;
    }

    html += '</div>';
    return html;
}

// =============================================
// === SVN Properties View (NEW) ===
// =============================================
async function fetchProperties() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        render();
        return;
    }

    state.isScanning = true;
    render();

    const target = state.propertiesTarget || '.';
    const result = await runSvnSilent(['proplist', '-v', target]);
    state.isScanning = false;

    if (result && result.output) {
        state.properties = parseProplist(result.output);
    } else {
        state.properties = [];
    }
    render();
}

function parseProplist(output) {
    const props = [];
    const lines = output.split('\n');
    let currentProp = null;

    for (const line of lines) {
        // Property name line: "  svn:ignore" or "  svn:externals"
        const nameMatch = line.match(/^\s{2}(\S+)/);
        if (nameMatch && !line.startsWith('Properties on')) {
            if (currentProp) {
                currentProp.value = currentProp.value.trim();
                props.push(currentProp);
            }
            currentProp = { name: nameMatch[1], value: '' };
        } else if (currentProp && line.startsWith('    ')) {
            currentProp.value += (currentProp.value ? '\n' : '') + line.substring(4);
        }
    }
    if (currentProp) {
        currentProp.value = currentProp.value.trim();
        props.push(currentProp);
    }
    return props;
}

function renderProperties() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="properties-container">';

    // Target selector
    html += `<div class="prop-target-bar">
        <div class="prop-target-row">
            <input type="text" id="prop-target-input" class="auth-form-input" placeholder="Path (relative to working copy, e.g. '.' or 'src/file.txt')" value="${escapeHtml(state.propertiesTarget)}">
            <button class="btn-primary btn-small" onclick="changePropTarget()">Load</button>
        </div>
    </div>`;

    // Add property form
    html += `<div class="section-label">Add Property</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="prop-new-name" class="auth-form-input" placeholder="Property name (e.g. svn:ignore)">
            <input type="text" id="prop-new-value" class="auth-form-input" style="flex:2" placeholder="Property value">
            <button class="btn-primary btn-small" onclick="addProperty()">Set</button>
        </div>
    </div>`;

    // Properties list
    html += `<div class="section-label">Properties on '${escapeHtml(state.propertiesTarget)}' (${state.properties.length})</div>`;

    if (state.properties.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>No properties found.</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const prop of state.properties) {
            const isEditing = state.editingProp === prop.name;
            if (isEditing) {
                html += `
                    <div class="status-card prop-card prop-card-editing">
                        <div class="prop-edit-form">
                            <div class="prop-name-badge">${escapeHtml(prop.name)}</div>
                            <textarea id="prop-edit-value" class="prop-edit-textarea">${escapeHtml(prop.value)}</textarea>
                            <div class="auth-edit-actions">
                                <button class="btn-primary btn-small" onclick="updateProperty('${escapeHtml(prop.name)}')">Save</button>
                                <button class="btn-secondary btn-small" onclick="cancelEditProp()">Cancel</button>
                            </div>
                        </div>
                    </div>`;
            } else {
                html += `
                    <div class="status-card prop-card">
                        <div class="prop-info">
                            <span class="prop-name-badge">${escapeHtml(prop.name)}</span>
                            <pre class="prop-value">${escapeHtml(prop.value)}</pre>
                        </div>
                        <div class="file-actions" onclick="event.stopPropagation()">
                            <button class="btn-secondary btn-small" onclick="editProp('${escapeHtml(prop.name)}')">Edit</button>
                            <button class="btn-secondary btn-small" style="color: var(--error);" onclick="deleteProperty('${escapeHtml(prop.name)}')">Delete</button>
                        </div>
                    </div>`;
            }
        }
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function changePropTarget() {
    const input = document.getElementById('prop-target-input');
    if (input) {
        state.propertiesTarget = input.value.trim() || '.';
        fetchProperties();
    }
}

async function addProperty() {
    const name = document.getElementById('prop-new-name').value.trim();
    const value = document.getElementById('prop-new-value').value;
    if (!name) return alert('Property name is required.');

    const target = state.propertiesTarget || '.';
    const success = await runSvn(['propset', name, value, target]);
    if (success) {
        logToConsole(`Property '${name}' set on '${target}'.`, 'success');
        fetchProperties();
    }
}

function editProp(name) {
    state.editingProp = name;
    render();
}

function cancelEditProp() {
    state.editingProp = null;
    render();
}

async function updateProperty(name) {
    const textarea = document.getElementById('prop-edit-value');
    const value = textarea ? textarea.value : '';
    const target = state.propertiesTarget || '.';

    const success = await runSvn(['propset', name, value, target]);
    if (success) {
        state.editingProp = null;
        logToConsole(`Property '${name}' updated.`, 'success');
        fetchProperties();
    }
}

async function deleteProperty(name) {
    if (!confirm(`Delete property '${name}'?`)) return;
    const target = state.propertiesTarget || '.';
    const success = await runSvn(['propdel', name, target]);
    if (success) {
        logToConsole(`Property '${name}' deleted.`, 'success');
        fetchProperties();
    }
}

// =============================================
// === Branch / Tag Manager (NEW) ===
// =============================================
async function fetchBranchInfo() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        render();
        return;
    }

    state.isScanning = true;
    render();

    // Get svn info to find repo root and current URL
    const infoResult = await runSvnSilent(['info']);
    if (infoResult && infoResult.output) {
        const info = parseSvnInfo(infoResult.output);
        state.branchInfo = info;
        state.repoRootUrl = info.repositoryRoot || '';

        // Try to list branches and tags
        if (state.repoRootUrl) {
            await fetchBranchList();
            await fetchTagList();
        }
    } else {
        state.branchInfo = null;
        state.branchList = [];
        state.tagList = [];
    }

    state.isScanning = false;
    render();
}

function parseSvnInfo(output) {
    const info = {};
    const lines = output.split('\n');
    for (const line of lines) {
        const match = line.match(/^(.+?):\s+(.+)$/);
        if (match) {
            const key = match[1].trim();
            const val = match[2].trim();
            if (key === 'URL') info.url = val;
            if (key === 'Relative URL') info.relativeUrl = val;
            if (key === 'Repository Root') info.repositoryRoot = val;
            if (key === 'Revision') info.revision = val;
            if (key === 'Node Kind') info.nodeKind = val;
            if (key === 'Last Changed Author') info.lastAuthor = val;
            if (key === 'Last Changed Rev') info.lastRevision = val;
            if (key === 'Last Changed Date') info.lastDate = val;
            if (key === 'Lock Owner') info.lockOwner = val;
            if (key === 'Lock Created') info.lockCreated = val;
            if (key === 'Lock Comment') info.lockComment = val;
        }
    }
    return info;
}

async function fetchBranchList() {
    const branchesUrl = state.repoRootUrl + '/branches';
    try {
        const result = await window.api.runSvn(
            ['ls', branchesUrl],
            null,
            state.projects[state.selectedProjectIndex].url
        );
        if (result.success) {
            state.branchList = result.output.split('\n')
                .filter(l => l.trim())
                .map(l => l.replace(/\/$/, ''));
        } else {
            state.branchList = [];
        }
    } catch {
        state.branchList = [];
    }
}

async function fetchTagList() {
    const tagsUrl = state.repoRootUrl + '/tags';
    try {
        const result = await window.api.runSvn(
            ['ls', tagsUrl],
            null,
            state.projects[state.selectedProjectIndex].url
        );
        if (result.success) {
            state.tagList = result.output.split('\n')
                .filter(l => l.trim())
                .map(l => l.replace(/\/$/, ''));
        } else {
            state.tagList = [];
        }
    } catch {
        state.tagList = [];
    }
}

function renderBranch() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="branch-container">';

    // Current info
    if (state.branchInfo) {
        const info = state.branchInfo;
        const currentBranch = info.relativeUrl || info.url || 'Unknown';
        html += `<div class="section-label">Current Location</div>
        <div class="branch-info-card">
            <div class="branch-info-row"><span class="branch-label">URL</span><span class="branch-value">${escapeHtml(info.url || '')}</span></div>
            <div class="branch-info-row"><span class="branch-label">Relative</span><span class="branch-value">${escapeHtml(currentBranch)}</span></div>
            <div class="branch-info-row"><span class="branch-label">Revision</span><span class="branch-value">r${escapeHtml(info.revision || '')}</span></div>
            <div class="branch-info-row"><span class="branch-label">Last Author</span><span class="branch-value">${escapeHtml(info.lastAuthor || '')}</span></div>
            <div class="branch-info-row"><span class="branch-label">Last Changed</span><span class="branch-value">${escapeHtml(info.lastDate || '')}</span></div>
        </div>`;
    }

    // Create branch/tag
    html += `<div class="section-label">Create Branch / Tag</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <select id="branch-create-type" class="auth-form-input" style="flex:0 0 120px">
                <option value="branch">Branch</option>
                <option value="tag">Tag</option>
            </select>
            <input type="text" id="branch-create-name" class="auth-form-input" style="flex:2" placeholder="Name (e.g. feature-login)">
            <input type="text" id="branch-create-message" class="auth-form-input" style="flex:2" placeholder="Commit message">
            <button class="btn-primary btn-small" onclick="createBranchOrTag()">Create</button>
        </div>
    </div>`;

    // Branches list
    html += `<div class="section-label">Branches (${state.branchList.length})</div>`;
    if (state.branchList.length === 0) {
        html += `<div class="empty-state" style="padding: 32px 0;"><p>No branches found (or /branches path doesn't exist).</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const branch of state.branchList) {
            const branchUrl = state.repoRootUrl + '/branches/' + branch;
            html += `
                <div class="status-card branch-card">
                    <div class="file-info">
                        <span class="file-badge badge-added">B</span>
                        <span class="file-path">${escapeHtml(branch)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-primary btn-small" onclick="switchToBranch('${escapeHtml(branchUrl)}')">Switch</button>
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    // Tags list
    html += `<div class="section-label">Tags (${state.tagList.length})</div>`;
    if (state.tagList.length === 0) {
        html += `<div class="empty-state" style="padding: 32px 0;"><p>No tags found (or /tags path doesn't exist).</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const tag of state.tagList) {
            const tagUrl = state.repoRootUrl + '/tags/' + tag;
            html += `
                <div class="status-card branch-card">
                    <div class="file-info">
                        <span class="file-badge badge-modified">T</span>
                        <span class="file-path">${escapeHtml(tag)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-primary btn-small" onclick="switchToBranch('${escapeHtml(tagUrl)}')">Switch</button>
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

async function createBranchOrTag() {
    const type = document.getElementById('branch-create-type').value;
    const name = document.getElementById('branch-create-name').value.trim();
    const message = document.getElementById('branch-create-message').value.trim();

    if (!name) return alert('Please enter a name.');
    if (!message) return alert('Please enter a commit message.');
    if (!state.branchInfo || !state.branchInfo.url) return alert('Cannot determine current URL. Please refresh.');

    const destPath = type === 'branch' ? 'branches' : 'tags';
    const destUrl = state.repoRootUrl + '/' + destPath + '/' + name;
    const sourceUrl = state.branchInfo.url;

    const success = await runSvn(['copy', sourceUrl, destUrl, '-m', message]);
    if (success) {
        logToConsole(`${type === 'branch' ? 'Branch' : 'Tag'} '${name}' created.`, 'success');
        fetchBranchInfo();
    }
}

async function switchToBranch(targetUrl) {
    if (!confirm(`Switch working copy to:\n${targetUrl}`)) return;
    const success = await runSvn(['switch', targetUrl]);
    if (success) {
        logToConsole(`Switched to: ${targetUrl}`, 'success');
        fetchBranchInfo();
    }
}

// =============================================
// === Lock / Unlock Manager (NEW) ===
// =============================================
async function fetchLockStatus() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        render();
        return;
    }

    state.isScanning = true;
    render();

    const result = await runSvnSilent(['status', '-u']);
    state.isScanning = false;

    if (result && result.output) {
        parseLockStatus(result.output);
    } else {
        state.lockFiles = [];
    }
    render();
}

function parseLockStatus(output) {
    const files = [];
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
        if (line.length < 9) continue;
        if (line.startsWith('Status against revision')) continue;

        const lockChar = line.length > 5 ? line[5] : ' ';
        const filePath = line.substring(21).trim();

        if (lockChar === 'K' || lockChar === 'O' || lockChar === 'T' || lockChar === 'B') {
            let lockStatus = 'unknown';
            if (lockChar === 'K') lockStatus = 'locked-mine';
            else if (lockChar === 'O') lockStatus = 'locked-other';
            else if (lockChar === 'T') lockStatus = 'stolen';
            else if (lockChar === 'B') lockStatus = 'broken';

            files.push({
                path: filePath,
                lockStatus: lockStatus,
                lockChar: lockChar
            });
        }
    }
    state.lockFiles = files;
}

function renderLockView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="lock-container">';

    html += `<div class="section-label">Lock a File</div>
    <div class="auth-form">
        <div class="auth-form-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="text" id="lock-file-path" class="auth-form-input" style="flex:2; min-width: 200px;" placeholder="File path (relative to working copy)">
            <input type="text" id="lock-message" class="auth-form-input" style="flex:2; min-width: 200px;" placeholder="Lock message (optional)">
            <button class="btn-primary btn-small" onclick="lockFileFromInput()">Lock</button>
        </div>
    </div>`;

    html += `<div class="section-label">Locked Files (${state.lockFiles.length})</div>`;

    if (state.lockFiles.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>No locked files detected. Click Refresh to scan.</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const file of state.lockFiles) {
            const ep = escapePath(file.path);
            const badgeClass = file.lockStatus === 'locked-mine' ? 'badge-lock-mine' :
                               file.lockStatus === 'locked-other' ? 'badge-lock-other' :
                               file.lockStatus === 'stolen' ? 'badge-lock-stolen' : 'badge-lock-broken';
            const badgeLabel = file.lockStatus === 'locked-mine' ? 'K (Mine)' :
                               file.lockStatus === 'locked-other' ? 'O (Other)' :
                               file.lockStatus === 'stolen' ? 'T (Stolen)' : 'B (Broken)';

            html += `
                <div class="status-card lock-card" onclick="fetchLockInfo('${ep}')">
                    <div class="file-info">
                        <span class="file-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" onclick="fetchLockInfo('${ep}')">Info</button>
                        ${file.lockStatus === 'locked-mine' ?
                            `<button class="btn-secondary btn-small" onclick="unlockFile('${ep}', false)">Unlock</button>` :
                            `<button class="btn-secondary btn-small" style="color: var(--warning);" onclick="unlockFile('${ep}', true)">Force Unlock</button>`
                        }
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

async function lockFileFromInput() {
    const pathInput = document.getElementById('lock-file-path');
    const msgInput = document.getElementById('lock-message');
    const filePath = pathInput ? pathInput.value.trim() : '';
    const message = msgInput ? msgInput.value.trim() : '';

    if (!filePath) return alert('Please enter a file path.');
    await lockFile(filePath, message);
}

async function lockFile(path, message) {
    const args = ['lock', path];
    if (message) {
        args.push('-m', message);
    }
    const success = await runSvn(args);
    if (success) {
        logToConsole(`Locked: ${path}`, 'success');
        fetchLockStatus();
    }
}

async function unlockFile(path, force) {
    const args = ['unlock'];
    if (force) args.push('--force');
    args.push(path);

    const success = await runSvn(args);
    if (success) {
        logToConsole(`Unlocked: ${path}${force ? ' (forced)' : ''}`, 'success');
        fetchLockStatus();
    }
}

async function fetchLockInfo(path) {
    const result = await runSvnSilent(['info', path]);
    if (result && result.output) {
        const info = parseSvnInfo(result.output);
        let msg = `Lock Info for: ${path}\n`;
        msg += `Lock Owner: ${info.lockOwner || 'N/A'}\n`;
        msg += `Lock Created: ${info.lockCreated || 'N/A'}\n`;
        msg += `Lock Comment: ${info.lockComment || 'N/A'}`;
        logToConsole(msg, 'system');
    }
}

// =============================================
// === Blame / Annotate View (NEW) ===
// =============================================
async function fetchBlame(filePath) {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    state.blameFile = filePath;
    state.blameData = [];
    state.isScanning = true;
    render();

    const result = await runSvnSilent(['blame', '-v', filePath]);
    state.isScanning = false;

    if (result && result.output) {
        state.blameData = parseBlameOutput(result.output);
    } else {
        state.blameData = [];
    }
    render();
}

function parseBlameOutput(output) {
    const lines = output.split('\n');
    const parsed = [];

    for (const line of lines) {
        if (!line.trim()) continue;
        // svn blame -v output:
        //     123     author 2024-01-15 11:22:33 +0900 (Mon, 15 Jan 2024) content
        const match = line.match(/^\s*(\d+)\s+(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[^\(]*\([^)]+\))\s?(.*)$/);
        if (match) {
            parsed.push({
                revision: match[1],
                author: match[2],
                date: match[3].trim(),
                content: match[4]
            });
        } else {
            const simpleMatch = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
            if (simpleMatch) {
                parsed.push({
                    revision: simpleMatch[1],
                    author: simpleMatch[2],
                    date: '',
                    content: simpleMatch[3]
                });
            } else {
                parsed.push({
                    revision: '',
                    author: '',
                    date: '',
                    content: line
                });
            }
        }
    }
    return parsed;
}

function renderBlameView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="blame-container">';

    html += `<div class="section-label">Select File</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="blame-file-path" class="auth-form-input" style="flex:3" placeholder="File path (relative to working copy, e.g. src/main.js)" value="${escapeHtml(state.blameFile)}">
            <button class="btn-primary btn-small" onclick="loadBlameFromInput()">Load</button>
        </div>
    </div>`;

    if (state.blameData.length === 0 && !state.blameFile) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>Enter a file path above and click Load to view blame/annotate data.</p></div>`;
    } else if (state.blameData.length === 0 && state.blameFile) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>No blame data for '${escapeHtml(state.blameFile)}'. The file may be unversioned or binary.</p></div>`;
    } else {
        const authorColors = getAuthorColorMap(state.blameData);

        html += `<div class="section-label">Blame for '${escapeHtml(state.blameFile)}' (${state.blameData.length} lines)</div>`;
        html += '<div class="blame-table-wrapper"><table class="blame-table"><thead><tr>';
        html += '<th class="blame-col-line">#</th>';
        html += '<th class="blame-col-rev">Rev</th>';
        html += '<th class="blame-col-author">Author</th>';
        html += '<th class="blame-col-code">Code</th>';
        html += '</tr></thead><tbody>';

        for (let i = 0; i < state.blameData.length; i++) {
            const entry = state.blameData[i];
            const lineNum = i + 1;
            const authorColor = authorColors[entry.author] || 'var(--text-dim)';
            html += `<tr class="blame-row" style="--author-color: ${authorColor}">
                <td class="blame-col-line">${lineNum}</td>
                <td class="blame-col-rev">r${escapeHtml(entry.revision)}</td>
                <td class="blame-col-author" style="color: ${authorColor}">${escapeHtml(entry.author)}</td>
                <td class="blame-col-code"><pre>${escapeHtml(entry.content)}</pre></td>
            </tr>`;
        }

        html += '</tbody></table></div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function loadBlameFromInput() {
    const input = document.getElementById('blame-file-path');
    const filePath = input ? input.value.trim() : '';
    if (!filePath) return alert('Please enter a file path.');
    fetchBlame(filePath);
}

function getAuthorColorMap(blameData) {
    const authors = [...new Set(blameData.map(e => e.author).filter(a => a))];
    const palette = [
        '#6366f1', '#a855f7', '#ec4899', '#f43f5e',
        '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
        '#8b5cf6', '#14b8a6', '#f97316', '#84cc16',
        '#e879f9', '#22d3ee', '#fb923c', '#a3e635'
    ];
    const map = {};
    authors.forEach((author, i) => {
        map[author] = palette[i % palette.length];
    });
    return map;
}

// =============================================
// === Settings Page (NEW) ===
// =============================================
function renderSettings() {
    const s = state.settings;

    let html = '<div class="settings-container">';

    // General
    html += `<div class="section-label">General</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Log Entries Limit</span>
                <span class="settings-desc">Number of log entries per page</span>
            </div>
            <input type="number" id="settings-log-limit" class="settings-input" value="${s.logLimit}" min="5" max="200" onchange="onSettingChange()">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Theme</span>
                <span class="settings-desc">UI color theme</span>
            </div>
            <select id="settings-theme" class="settings-input" onchange="onSettingChange()">
                <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark (Default)</option>
                <option value="midnight" ${s.theme === 'midnight' ? 'selected' : ''}>Midnight Blue</option>
                <option value="forest" ${s.theme === 'forest' ? 'selected' : ''}>Forest Green</option>
            </select>
        </div>
    </div>`;

    // Auto-refresh
    html += `<div class="section-label">Auto-refresh</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Enable Auto-refresh</span>
                <span class="settings-desc">Watch files for changes and refresh status automatically</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="settings-auto-refresh" ${s.autoRefresh ? 'checked' : ''} onchange="onAutoRefreshToggle()">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Debounce Interval</span>
                <span class="settings-desc">Delay before auto-refresh triggers (ms)</span>
            </div>
            <input type="number" id="settings-auto-interval" class="settings-input" value="${s.autoRefreshInterval}" min="1000" max="30000" step="1000" onchange="onSettingChange()">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Watcher Status</span>
                <span class="settings-desc">File watcher is currently ${state.watcherActive ? 'active' : 'inactive'}</span>
            </div>
            <span class="settings-status-badge ${state.watcherActive ? 'active' : ''}">${state.watcherActive ? 'Active' : 'Inactive'}</span>
        </div>
    </div>`;

    // Keyboard shortcuts
    html += `<div class="section-label">Keyboard Shortcuts</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Show Shortcuts Help</span>
                <span class="settings-desc">Press <kbd>?</kbd> anywhere to view all shortcuts</span>
            </div>
            <button class="btn-secondary btn-small" onclick="openShortcutsModal()">View Shortcuts</button>
        </div>
    </div>`;

    // About
    html += `<div class="section-label">About</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">JellySvn</span>
                <span class="settings-desc">Premium SVN Client — Glassmorphism Dark UI</span>
            </div>
            <span class="settings-version">v1.0.0</span>
        </div>
    </div>`;

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function onSettingChange() {
    const logLimit = parseInt(document.getElementById('settings-log-limit').value) || 20;
    const theme = document.getElementById('settings-theme').value;
    const interval = parseInt(document.getElementById('settings-auto-interval').value) || 5000;

    state.settings.logLimit = logLimit;
    state.settings.theme = theme;
    state.settings.autoRefreshInterval = interval;
    state.logLimit = logLimit;

    applyTheme(theme);
    saveSettings();
}

function onAutoRefreshToggle() {
    const checkbox = document.getElementById('settings-auto-refresh');
    state.settings.autoRefresh = checkbox.checked;
    saveSettings();

    if (checkbox.checked) {
        startWatcher();
    } else {
        stopWatcher();
    }
    // Re-render to update status badge
    setTimeout(() => render(), 300);
}

function applyTheme(theme) {
    const root = document.documentElement;
    switch (theme) {
        case 'midnight':
            root.style.setProperty('--bg-deep', '#0a0e1a');
            root.style.setProperty('--bg-dark', '#101627');
            root.style.setProperty('--accent-primary', '#3b82f6');
            root.style.setProperty('--accent-secondary', '#8b5cf6');
            break;
        case 'forest':
            root.style.setProperty('--bg-deep', '#0a100e');
            root.style.setProperty('--bg-dark', '#111f18');
            root.style.setProperty('--accent-primary', '#10b981');
            root.style.setProperty('--accent-secondary', '#34d399');
            break;
        default: // dark
            root.style.setProperty('--bg-deep', '#0a0b10');
            root.style.setProperty('--bg-dark', '#12141c');
            root.style.setProperty('--accent-primary', '#6366f1');
            root.style.setProperty('--accent-secondary', '#a855f7');
            break;
    }
}

// =============================================
// === Search View (NEW) ===
// =============================================
let _searchDebounceTimer = null;

function renderSearchView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="search-container">';

    // Search bar
    html += `<div class="search-bar">
        <div class="search-bar-row">
            <input type="text" id="search-query-input" class="search-input" placeholder="Search files..." value="${escapeHtml(state.searchQuery)}" onkeydown="if(event.key==='Enter'){executeSearch();}">
            <div class="search-type-toggle">
                <button class="${state.searchType === 'filename' ? 'active' : ''}" onclick="setSearchType('filename')">Filename</button>
                <button class="${state.searchType === 'content' ? 'active' : ''}" onclick="setSearchType('content')">Content</button>
            </div>
            <button class="btn-primary" onclick="executeSearch()" ${state.searchLoading ? 'disabled' : ''}>Search</button>
        </div>
    </div>`;

    // Results area
    if (state.searchLoading) {
        html += '<div class="empty-state" style="padding: 64px 0;"><div class="loading-spinner"></div><p>Searching...</p></div>';
    } else if (state.searchQuery && state.searchResults.length > 0) {
        const truncatedNote = state.searchResultsTruncated ? ' (results limited to 200)' : '';
        html += `<div class="search-results-header">${state.searchResults.length} match${state.searchResults.length !== 1 ? 'es' : ''} found${truncatedNote}</div>`;
        html += '<div class="search-results-list">';
        for (const result of state.searchResults) {
            if (result.type === 'content' && result.matches) {
                html += `<div class="search-result-card">
                    <div class="search-result-header">
                        <span class="search-result-icon">📄</span>
                        <span class="search-result-path">${escapeHtml(result.path)}</span>
                    </div>
                    <div class="search-result-matches">`;
                for (const match of result.matches) {
                    const lineText = match.text;
                    const highlighted = highlightSearchMatch(lineText, state.searchQuery);
                    html += `<div class="search-match-line">
                        <span class="search-match-linenum">L${match.lineNumber}</span>
                        <span class="search-match-text">${highlighted}</span>
                    </div>`;
                }
                html += `</div></div>`;
            } else {
                const highlighted = highlightSearchMatch(result.name, state.searchQuery);
                html += `<div class="search-result-card">
                    <div class="search-result-header">
                        <span class="search-result-icon">📄</span>
                        <span class="search-result-path">${escapeHtml(result.path)}</span>
                    </div>
                    <div class="search-result-filename">
                        <span class="search-match-text">${highlighted}</span>
                    </div>
                </div>`;
            }
        }
        html += '</div>';
    } else if (state.searchQuery && state.searchResults.length === 0) {
        html += '<div class="empty-state" style="padding: 64px 0;"><p>No matches found.</p></div>';
    } else {
        html += '<div class="empty-state" style="padding: 64px 0;"><p>Enter a query and press Search.</p></div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;

    // Focus the input and restore cursor position
    const input = document.getElementById('search-query-input');
    if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

function setSearchType(type) {
    state.searchType = type;
    render();
}

function highlightSearchMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const queryEscaped = escapeHtml(query);
    const regex = new RegExp(`(${queryEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

async function executeSearch() {
    const input = document.getElementById('search-query-input');
    const query = input ? input.value.trim() : '';

    if (!query) return;

    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        logToConsole('No project selected.', 'warning');
        return;
    }

    state.searchQuery = query;
    state.searchLoading = true;
    state.searchResults = [];
    state.searchResultsTruncated = false;
    render();

    logToConsole(`Searching for "${query}" (${state.searchType})...`, 'system');

    try {
        const result = await window.api.searchFiles(project.path, query, state.searchType);
        state.searchLoading = false;

        if (result.success) {
            state.searchResults = result.results;
            state.searchResultsTruncated = result.truncated || false;
            logToConsole(`Search complete: ${result.results.length} result${result.results.length !== 1 ? 's' : ''} found.`, 'success');
        } else {
            state.searchResults = [];
            logToConsole(`Search error: ${result.error || 'Unknown error'}`, 'error');
        }
    } catch (err) {
        state.searchLoading = false;
        state.searchResults = [];
        logToConsole(`Search failed: ${err.message}`, 'error');
    }

    render();
}

// =============================================
// === Merge Operations (NEW) ===
// =============================================
function renderMergeView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="merge-container">';

    // Source URL input
    html += `<div class="section-label">Merge Source</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="merge-source-url" class="auth-form-input" style="flex:3" placeholder="Source URL (e.g. https://svn.example.com/repo/branches/feature)" value="${escapeHtml(state.mergeSource)}">
        </div>`;

    // Branch suggestions
    if (state.branchList.length > 0 && state.repoRootUrl) {
        html += `<div class="merge-suggestions">
            <span class="merge-suggestions-label">Branches:</span>`;
        for (const branch of state.branchList) {
            const branchUrl = state.repoRootUrl + '/branches/' + branch;
            html += `<button class="btn-secondary btn-small merge-suggestion-btn" onclick="document.getElementById('merge-source-url').value='${escapeHtml(branchUrl)}'">${escapeHtml(branch)}</button>`;
        }
        html += '</div>';
    }

    html += '</div>';

    // Revision range inputs
    html += `<div class="section-label">Revision Range (Optional)</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="merge-rev-from" class="auth-form-input" placeholder="From revision (e.g. 100)" value="${escapeHtml(state.mergeRevFrom)}">
            <span class="merge-rev-separator">to</span>
            <input type="text" id="merge-rev-to" class="auth-form-input" placeholder="To revision (e.g. 150)" value="${escapeHtml(state.mergeRevTo)}">
        </div>
    </div>`;

    // Options
    html += `<div class="section-label">Options</div>
    <div class="auth-form">
        <div class="auth-form-row" style="align-items: center;">
            <label class="checkbox-container" style="margin-right: 12px;">
                <input type="checkbox" id="merge-reintegrate">
                <span class="checkmark"></span>
            </label>
            <span style="color: var(--text-secondary);">Reintegrate merge (merge branch back into trunk)</span>
        </div>
    </div>`;

    // Action buttons
    html += `<div class="merge-actions">
        <button class="btn-secondary" onclick="previewMerge()">Preview (Dry Run)</button>
        <button class="btn-primary" onclick="executeMerge()">Execute Merge</button>
    </div>`;

    // Preview results
    if (state.mergePreview.length > 0) {
        html += `<div class="section-label">Preview Results (${state.mergePreview.length} files affected)</div>`;
        html += '<div class="status-list">';
        for (const item of state.mergePreview) {
            html += `
                <div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-${item.status}">${item.action}</span>
                        <span class="file-path">${escapeHtml(item.path)}</span>
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

async function previewMerge() {
    const sourceUrl = document.getElementById('merge-source-url').value.trim();
    if (!sourceUrl) return alert('Please enter a source URL.');

    state.mergeSource = sourceUrl;
    const revFrom = document.getElementById('merge-rev-from').value.trim();
    const revTo = document.getElementById('merge-rev-to').value.trim();
    state.mergeRevFrom = revFrom;
    state.mergeRevTo = revTo;

    const command = ['merge'];

    // Add revision range if specified
    if (revFrom && revTo) {
        command.push('-r', `${revFrom}:${revTo}`);
    } else if (revFrom) {
        command.push('-r', `${revFrom}:HEAD`);
    }

    command.push(sourceUrl, '--dry-run');

    logToConsole(`Preview merge: svn ${command.join(' ')}`, 'system');
    const result = await runSvnSilent(command);

    if (result) {
        state.mergePreview = parseMergeOutput(result.output || '');
        if (state.mergePreview.length === 0) {
            logToConsole('Dry run complete: no files affected.', 'system');
        } else {
            logToConsole(`Dry run complete: ${state.mergePreview.length} files would be affected.`, 'success');
        }
    } else {
        state.mergePreview = [];
    }
    render();
}

function parseMergeOutput(output) {
    const items = [];
    const lines = output.split('\n').filter(l => l.trim());
    for (const line of lines) {
        // Merge output lines: "U    path/to/file", "A    path/to/file", "C    path"
        const match = line.match(/^([ADUCGR ])\s+(.+)/);
        if (match) {
            const actionChar = match[1].trim();
            const filePath = match[2].trim();
            let status = 'modified';
            let action = actionChar || 'U';
            if (actionChar === 'A') status = 'added';
            else if (actionChar === 'D') status = 'deleted';
            else if (actionChar === 'U') status = 'modified';
            else if (actionChar === 'C') status = 'conflict';
            else if (actionChar === 'G') status = 'modified';
            else if (actionChar === 'R') status = 'modified';
            items.push({ action, path: filePath, status });
        }
    }
    return items;
}

async function executeMerge() {
    const sourceUrl = document.getElementById('merge-source-url').value.trim();
    if (!sourceUrl) return alert('Please enter a source URL.');

    const reintegrate = document.getElementById('merge-reintegrate').checked;
    const revFrom = document.getElementById('merge-rev-from').value.trim();
    const revTo = document.getElementById('merge-rev-to').value.trim();

    state.mergeSource = sourceUrl;
    state.mergeRevFrom = revFrom;
    state.mergeRevTo = revTo;

    if (!confirm(`Are you sure you want to merge from:\n${sourceUrl}\n\nThis will modify your working copy.`)) return;

    const command = ['merge'];

    if (reintegrate) {
        command.push('--reintegrate');
    } else if (revFrom && revTo) {
        command.push('-r', `${revFrom}:${revTo}`);
    } else if (revFrom) {
        command.push('-r', `${revFrom}:HEAD`);
    }

    command.push(sourceUrl);

    const success = await runSvn(command);
    if (success) {
        logToConsole('Merge completed successfully.', 'success');
        state.mergePreview = [];
        refreshStatus();
    }
}

// =============================================
// === Export / Import (NEW) ===
// =============================================
function renderExportImportView() {
    const project = state.projects[state.selectedProjectIndex];

    let html = '<div class="export-import-container">';

    // === Export Section ===
    html += `<div class="section-label">Export</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Source</span>
                <span class="settings-desc">Choose what to export</span>
            </div>
            <div class="export-source-toggle">
                <label style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary); cursor: pointer;">
                    <input type="radio" name="export-source" value="wc" checked onchange="toggleExportSource()"> Working Copy
                </label>
                <label style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary); cursor: pointer;">
                    <input type="radio" name="export-source" value="url" onchange="toggleExportSource()"> Repository URL
                </label>
            </div>
        </div>
        <div class="settings-row" id="export-url-row" style="display: none;">
            <div class="settings-info">
                <span class="settings-title">Repository URL</span>
                <span class="settings-desc">SVN repository URL to export from</span>
            </div>
            <input type="text" id="export-url" class="auth-form-input" style="flex: 1; max-width: 400px;" placeholder="https://svn.example.com/repo/trunk">
        </div>
        <div class="settings-row" id="export-rev-row" style="display: none;">
            <div class="settings-info">
                <span class="settings-title">Revision</span>
                <span class="settings-desc">Optional revision number</span>
            </div>
            <input type="text" id="export-revision" class="auth-form-input" style="flex: 0 0 120px;" placeholder="HEAD">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Destination</span>
                <span class="settings-desc">Local path to export files to</span>
            </div>
            <div class="input-with-button" style="flex: 1; max-width: 400px;">
                <input type="text" id="export-dest" class="auth-form-input" placeholder="/path/to/export/dir">
                <button class="btn-secondary btn-small" onclick="browseExportDest()">Browse</button>
            </div>
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doExport()">Export</button>
        </div>
    </div>`;

    // === Import Section ===
    html += `<div class="section-label">Import</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Local Path</span>
                <span class="settings-desc">Local directory or file to import</span>
            </div>
            <div class="input-with-button" style="flex: 1; max-width: 400px;">
                <input type="text" id="import-local-path" class="auth-form-input" placeholder="/path/to/local/dir">
                <button class="btn-secondary btn-small" onclick="browseImportPath()">Browse</button>
            </div>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Target URL</span>
                <span class="settings-desc">SVN repository URL to import into</span>
            </div>
            <input type="text" id="import-target-url" class="auth-form-input" style="flex: 1; max-width: 400px;" placeholder="https://svn.example.com/repo/trunk/new-folder">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Commit Message</span>
                <span class="settings-desc">Message for the import commit</span>
            </div>
            <input type="text" id="import-message" class="auth-form-input" style="flex: 1; max-width: 400px;" placeholder="Importing files...">
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doImport()">Import</button>
        </div>
    </div>`;

    // Append Patch sections
    html += renderExportImportViewExtended();

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function toggleExportSource() {
    const radios = document.querySelectorAll('input[name="export-source"]');
    const isUrl = Array.from(radios).find(r => r.value === 'url')?.checked;
    const urlRow = document.getElementById('export-url-row');
    const revRow = document.getElementById('export-rev-row');
    if (urlRow) urlRow.style.display = isUrl ? '' : 'none';
    if (revRow) revRow.style.display = isUrl ? '' : 'none';
}

async function browseExportDest() {
    try {
        const data = await window.api.browseFolder();
        if (data.path) {
            document.getElementById('export-dest').value = data.path;
            logToConsole(`Selected export destination: ${data.path}`, 'success');
        }
    } catch (err) {
        logToConsole(`Picker Error: ${err.message}`, 'error');
    }
}

async function browseImportPath() {
    try {
        const data = await window.api.browseFolder();
        if (data.path) {
            document.getElementById('import-local-path').value = data.path;
            logToConsole(`Selected import path: ${data.path}`, 'success');
        }
    } catch (err) {
        logToConsole(`Picker Error: ${err.message}`, 'error');
    }
}

async function doExport() {
    const radios = document.querySelectorAll('input[name="export-source"]');
    const isUrl = Array.from(radios).find(r => r.value === 'url')?.checked;
    const dest = document.getElementById('export-dest').value.trim();

    if (!dest) return alert('Please enter a destination path.');

    let source;
    if (isUrl) {
        source = document.getElementById('export-url').value.trim();
        if (!source) return alert('Please enter a repository URL.');
    } else {
        const project = state.projects[state.selectedProjectIndex];
        if (!project) return alert('No project selected. Please select a project or choose "Repository URL".');
        source = project.path;
    }

    const command = ['export', source, dest];

    // Add revision if URL mode and revision specified
    if (isUrl) {
        const rev = document.getElementById('export-revision').value.trim();
        if (rev) {
            command.push('-r', rev);
        }
    }

    // Add --force to overwrite if destination exists
    command.push('--force');

    logToConsole(`Exporting: svn ${command.join(' ')}`, 'system');
    const success = await runSvn(command);
    if (success) {
        logToConsole(`Export completed to: ${dest}`, 'success');
    }
}

async function doImport() {
    const localPath = document.getElementById('import-local-path').value.trim();
    const targetUrl = document.getElementById('import-target-url').value.trim();
    const message = document.getElementById('import-message').value.trim();

    if (!localPath) return alert('Please enter a local path.');
    if (!targetUrl) return alert('Please enter a target URL.');
    if (!message) return alert('Please enter a commit message.');

    if (!confirm(`Import files from:\n${localPath}\n\nTo repository:\n${targetUrl}\n\nWith message: "${message}"`)) return;

    const command = ['import', localPath, targetUrl, '-m', message];

    logToConsole(`Importing: svn ${command.join(' ')}`, 'system');
    const success = await runSvn(command, targetUrl);
    if (success) {
        logToConsole(`Import completed to: ${targetUrl}`, 'success');
    }
}

// =============================================
// === Tools View (Cleanup, Relocate, Copy/Move) ===
// =============================================
function renderToolsView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="tools-container">';

    // === Cleanup Section ===
    html += `<div class="section-label">SVN Cleanup</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Cleanup Working Copy</span>
                <span class="settings-desc">Remove locks, resume unfinished operations, and fix broken working copy state</span>
            </div>
            <button class="btn-primary" onclick="doCleanup()">Run Cleanup</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Cleanup with Vacuum</span>
                <span class="settings-desc">Run cleanup and also compact the working copy metadata (SQLite vacuum)</span>
            </div>
            <button class="btn-secondary" onclick="doCleanup(true)">Cleanup + Vacuum</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Remove Unversioned Files</span>
                <span class="settings-desc">Remove all unversioned files and directories from the working copy</span>
            </div>
            <button class="btn-secondary" style="color: var(--error);" onclick="doCleanupRemoveUnversioned()">Remove Unversioned</button>
        </div>
    </div>`;

    // === Relocate Section ===
    html += `<div class="section-label">Relocate Repository</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Current Repository URL</span>
                <span class="settings-desc">${escapeHtml(project.url || '(unknown — run svn info to detect)')}</span>
            </div>
            <button class="btn-secondary btn-small" onclick="detectRepoUrl()">Detect</button>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">From URL</span>
                <span class="settings-desc">Old repository root URL</span>
            </div>
            <input type="text" id="relocate-from-url" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="https://old-server.com/svn/repo" value="${escapeHtml(project.url || '')}">
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">To URL</span>
                <span class="settings-desc">New repository root URL</span>
            </div>
            <input type="text" id="relocate-to-url" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="https://new-server.com/svn/repo">
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doRelocate()">Relocate</button>
        </div>
    </div>`;

    // === Copy / Move / Rename Section ===
    html += `<div class="section-label">Copy / Move / Rename</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Operation</span>
                <span class="settings-desc">Copy duplicates a file; Move/Rename relocates it</span>
            </div>
            <select id="copymove-operation" class="settings-input" onchange="onCopyMoveOpChange()">
                <option value="copy">Copy (svn copy)</option>
                <option value="move">Move / Rename (svn move)</option>
            </select>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">Source Path</span>
                <span class="settings-desc">Relative path in working copy</span>
            </div>
            <input type="text" id="copymove-source" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="src/old-file.js">
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">Destination Path</span>
                <span class="settings-desc">New path or new name</span>
            </div>
            <input type="text" id="copymove-dest" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="src/new-file.js">
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doCopyMove()">Execute</button>
        </div>
    </div>`;

    // === Changelist Section ===
    html += `<div class="section-label">Changelists</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Add File to Changelist</span>
                <span class="settings-desc">Organize modified files into named groups</span>
            </div>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="text" id="changelist-name" class="auth-form-input" style="flex: 1; min-width: 150px;" placeholder="Changelist name (e.g. feature-login)">
            <input type="text" id="changelist-file" class="auth-form-input" style="flex: 2; min-width: 200px;" placeholder="File path (relative)">
            <button class="btn-primary btn-small" onclick="addToChangelist()">Add</button>
            <button class="btn-secondary btn-small" onclick="removeFromChangelist()">Remove</button>
        </div>
    </div>`;

    // Show current changelists
    if (Object.keys(state.changelists).length > 0) {
        for (const [clName, files] of Object.entries(state.changelists)) {
            html += `<div class="section-label">Changelist: ${escapeHtml(clName)} (${files.length} files)</div>`;
            html += '<div class="status-list">';
            for (const file of files) {
                html += `<div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-modified">CL</span>
                        <span class="file-path">${escapeHtml(file)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" style="color: var(--error);" onclick="removeFileFromChangelist('${escapeHtml(clName)}', '${escapePath(file)}')">Remove</button>
                    </div>
                </div>`;
            }
            html += '</div>';
            html += `<div style="padding: 8px 0;">
                <button class="btn-primary btn-small" onclick="commitChangelist('${escapeHtml(clName)}')">Commit Changelist</button>
            </div>`;
        }
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;

    // Load changelists
    fetchChangelists();
}

// --- Cleanup ---
async function doCleanup(vacuum = false) {
    const args = ['cleanup'];
    if (vacuum) {
        args.push('--vacuum-pristines');
    }
    const success = await runSvn(args);
    if (success) {
        logToConsole(`Cleanup completed${vacuum ? ' (with vacuum)' : ''}.`, 'success');
    }
}

async function doCleanupRemoveUnversioned() {
    if (!confirm('This will permanently delete ALL unversioned files and directories. Continue?')) return;
    const args = ['cleanup', '--remove-unversioned'];
    const success = await runSvn(args);
    if (success) {
        logToConsole('Unversioned files removed.', 'success');
        refreshStatus();
    }
}

// --- Relocate ---
async function detectRepoUrl() {
    const result = await runSvnSilent(['info']);
    if (result && result.output) {
        const info = parseSvnInfo(result.output);
        if (info.repositoryRoot) {
            const fromInput = document.getElementById('relocate-from-url');
            if (fromInput) fromInput.value = info.repositoryRoot;
            logToConsole(`Detected repository root: ${info.repositoryRoot}`, 'success');
        }
        if (info.url) {
            const project = state.projects[state.selectedProjectIndex];
            if (project && !project.url) {
                project.url = info.url;
                await window.api.saveProject(project);
            }
        }
    }
}

async function doRelocate() {
    const fromUrl = document.getElementById('relocate-from-url').value.trim();
    const toUrl = document.getElementById('relocate-to-url').value.trim();

    if (!fromUrl) return alert('Please enter the old (from) URL.');
    if (!toUrl) return alert('Please enter the new (to) URL.');
    if (fromUrl === toUrl) return alert('From and To URLs are the same.');

    if (!confirm(`Relocate repository?\n\nFrom: ${fromUrl}\nTo: ${toUrl}\n\nThis will update the working copy metadata to point to the new URL.`)) return;

    const success = await runSvn(['relocate', fromUrl, toUrl]);
    if (success) {
        logToConsole(`Repository relocated from ${fromUrl} to ${toUrl}`, 'success');
        // Update project URL
        const project = state.projects[state.selectedProjectIndex];
        if (project) {
            project.url = project.url ? project.url.replace(fromUrl, toUrl) : toUrl;
            await window.api.saveProject(project);
            logToConsole('Project URL updated.', 'success');
        }
    }
}

// --- Copy / Move / Rename ---
function onCopyMoveOpChange() {
    // Just UI feedback, no state change needed
}

async function doCopyMove() {
    const op = document.getElementById('copymove-operation').value;
    const source = document.getElementById('copymove-source').value.trim();
    const dest = document.getElementById('copymove-dest').value.trim();

    if (!source) return alert('Please enter a source path.');
    if (!dest) return alert('Please enter a destination path.');

    const svnCmd = op === 'copy' ? 'copy' : 'move';
    const label = op === 'copy' ? 'Copy' : 'Move';

    if (!confirm(`${label} file?\n\nFrom: ${source}\nTo: ${dest}`)) return;

    const success = await runSvn([svnCmd, source, dest]);
    if (success) {
        logToConsole(`${label} completed: ${source} → ${dest}`, 'success');
        refreshStatus();
    }
}

// --- Changelist ---
async function fetchChangelists() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    const result = await window.api.runSvn(['status'], project.path, project.url);
    if (result && result.success) {
        const changelists = {};
        const lines = result.output.split('\n');
        let currentCl = null;

        for (const line of lines) {
            const clMatch = line.match(/^--- Changelist '(.+?)':/);
            if (clMatch) {
                currentCl = clMatch[1];
                changelists[currentCl] = [];
                continue;
            }
            if (currentCl && line.trim() && line.length > 8) {
                const filePath = line.substring(8).trim();
                if (filePath) {
                    changelists[currentCl].push(filePath);
                }
            } else if (!line.startsWith('---') && line.trim()) {
                currentCl = null;
            }
        }
        state.changelists = changelists;
    }
}

async function addToChangelist() {
    const name = document.getElementById('changelist-name').value.trim();
    const file = document.getElementById('changelist-file').value.trim();
    if (!name) return alert('Please enter a changelist name.');
    if (!file) return alert('Please enter a file path.');

    const success = await runSvn(['changelist', name, file]);
    if (success) {
        logToConsole(`Added '${file}' to changelist '${name}'.`, 'success');
        fetchChangelists();
        render();
    }
}

async function removeFromChangelist() {
    const file = document.getElementById('changelist-file').value.trim();
    if (!file) return alert('Please enter a file path.');

    const success = await runSvn(['changelist', '--remove', file]);
    if (success) {
        logToConsole(`Removed '${file}' from changelist.`, 'success');
        fetchChangelists();
        render();
    }
}

async function removeFileFromChangelist(clName, file) {
    const success = await runSvn(['changelist', '--remove', file]);
    if (success) {
        logToConsole(`Removed '${file}' from changelist '${clName}'.`, 'success');
        fetchChangelists();
        render();
    }
}

async function commitChangelist(clName) {
    const msg = prompt(`Enter commit message for changelist '${clName}':`);
    if (!msg) return;

    const success = await runSvn(['commit', '--changelist', clName, '-m', msg]);
    if (success) {
        logToConsole(`Changelist '${clName}' committed.`, 'success');
        fetchChangelists();
        refreshStatus();
    }
}

// =============================================
// === Ignore Management (NEW) ===
// =============================================
async function fetchIgnorePatterns() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        render();
        return;
    }

    const target = state.ignoreTarget || '.';
    const result = await runSvnSilent(['propget', 'svn:ignore', target]);

    if (result && result.output) {
        state.ignorePatterns = result.output.split('\n').filter(l => l.trim());
    } else {
        state.ignorePatterns = [];
    }
    render();
}

function renderIgnoreView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="ignore-container">';

    // Target selector
    html += `<div class="section-label">Target Directory</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="ignore-target-input" class="auth-form-input" style="flex:3" placeholder="Directory path (relative, e.g. '.' or 'src')" value="${escapeHtml(state.ignoreTarget)}">
            <button class="btn-primary btn-small" onclick="changeIgnoreTarget()">Load</button>
        </div>
    </div>`;

    // Add pattern
    html += `<div class="section-label">Add Ignore Pattern</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="ignore-new-pattern" class="auth-form-input" style="flex:2" placeholder="Pattern (e.g. *.log, build, .DS_Store, node_modules)">
            <button class="btn-primary btn-small" onclick="addIgnorePattern()">Add</button>
        </div>
        <div style="padding: 8px 0; display: flex; gap: 6px; flex-wrap: wrap;">
            <span style="color: var(--text-dim); font-size: 12px;">Quick add:</span>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('*.log')">*.log</button>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('*.tmp')">*.tmp</button>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('.DS_Store')">.DS_Store</button>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('node_modules')">node_modules</button>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('build')">build</button>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('dist')">dist</button>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('*.pyc')">*.pyc</button>
            <button class="btn-secondary btn-small" onclick="quickAddIgnore('__pycache__')">__pycache__</button>
        </div>
    </div>`;

    // Global ignore
    html += `<div class="section-label">Set Global Ignore (svn:global-ignores)</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="global-ignore-pattern" class="auth-form-input" style="flex:2" placeholder="Pattern (applied recursively to all subdirectories)">
            <button class="btn-primary btn-small" onclick="addGlobalIgnorePattern()">Add Global</button>
        </div>
    </div>`;

    // Current patterns
    html += `<div class="section-label">Ignore Patterns on '${escapeHtml(state.ignoreTarget)}' (${state.ignorePatterns.length})</div>`;

    if (state.ignorePatterns.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>No ignore patterns set. Add patterns above to ignore files.</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (let i = 0; i < state.ignorePatterns.length; i++) {
            const pattern = state.ignorePatterns[i];
            html += `
                <div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-untracked">🚫</span>
                        <span class="file-path" style="font-family: monospace;">${escapeHtml(pattern)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" style="color: var(--error);" onclick="removeIgnorePattern(${i})">Remove</button>
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    // Edit raw
    html += `<div class="section-label">Edit Raw (svn:ignore)</div>
    <div class="auth-form">
        <textarea id="ignore-raw-textarea" class="commit-textarea" style="min-height: 120px; font-family: monospace;">${escapeHtml(state.ignorePatterns.join('\n'))}</textarea>
        <div style="padding: 8px 0; display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn-primary btn-small" onclick="saveIgnoreRaw()">Save Raw</button>
        </div>
    </div>`;

    // Unversioned files for quick-ignore
    const untracked = state.workingCopy.filter(f => f.status === 'untracked');
    if (untracked.length > 0) {
        html += `<div class="section-label">Unversioned Files (click to ignore)</div>`;
        html += '<div class="status-list">';
        for (const file of untracked) {
            const fileName = file.path.split('/').pop();
            html += `
                <div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-untracked">?</span>
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" onclick="quickAddIgnore('${escapePath(fileName)}')">Ignore '${escapeHtml(fileName)}'</button>
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function changeIgnoreTarget() {
    const input = document.getElementById('ignore-target-input');
    if (input) {
        state.ignoreTarget = input.value.trim() || '.';
        fetchIgnorePatterns();
    }
}

async function addIgnorePattern() {
    const input = document.getElementById('ignore-new-pattern');
    const pattern = input ? input.value.trim() : '';
    if (!pattern) return alert('Please enter a pattern.');

    await quickAddIgnore(pattern);
    if (input) input.value = '';
}

async function quickAddIgnore(pattern) {
    if (state.ignorePatterns.includes(pattern)) {
        logToConsole(`Pattern '${pattern}' already exists.`, 'warning');
        return;
    }
    const newPatterns = [...state.ignorePatterns, pattern];
    const value = newPatterns.join('\n');
    const target = state.ignoreTarget || '.';

    const success = await runSvn(['propset', 'svn:ignore', value, target]);
    if (success) {
        state.ignorePatterns = newPatterns;
        logToConsole(`Added ignore pattern: ${pattern}`, 'success');
        render();
    }
}

async function removeIgnorePattern(index) {
    const pattern = state.ignorePatterns[index];
    if (!confirm(`Remove ignore pattern '${pattern}'?`)) return;

    const newPatterns = state.ignorePatterns.filter((_, i) => i !== index);
    const target = state.ignoreTarget || '.';

    if (newPatterns.length === 0) {
        const success = await runSvn(['propdel', 'svn:ignore', target]);
        if (success) {
            state.ignorePatterns = [];
            logToConsole(`Removed pattern: ${pattern}. No more ignore patterns.`, 'success');
            render();
        }
    } else {
        const value = newPatterns.join('\n');
        const success = await runSvn(['propset', 'svn:ignore', value, target]);
        if (success) {
            state.ignorePatterns = newPatterns;
            logToConsole(`Removed ignore pattern: ${pattern}`, 'success');
            render();
        }
    }
}

async function saveIgnoreRaw() {
    const textarea = document.getElementById('ignore-raw-textarea');
    const raw = textarea ? textarea.value : '';
    const target = state.ignoreTarget || '.';

    const patterns = raw.split('\n').filter(l => l.trim());

    if (patterns.length === 0) {
        const success = await runSvn(['propdel', 'svn:ignore', target]);
        if (success) {
            state.ignorePatterns = [];
            logToConsole('All ignore patterns removed.', 'success');
            render();
        }
    } else {
        const value = patterns.join('\n');
        const success = await runSvn(['propset', 'svn:ignore', value, target]);
        if (success) {
            state.ignorePatterns = patterns;
            logToConsole('Ignore patterns saved.', 'success');
            render();
        }
    }
}

async function addGlobalIgnorePattern() {
    const input = document.getElementById('global-ignore-pattern');
    const pattern = input ? input.value.trim() : '';
    if (!pattern) return alert('Please enter a pattern.');

    const target = state.ignoreTarget || '.';

    // Get existing global-ignores
    const result = await runSvnSilent(['propget', 'svn:global-ignores', target]);
    let existing = [];
    if (result && result.output) {
        existing = result.output.split('\n').filter(l => l.trim());
    }

    if (existing.includes(pattern)) {
        logToConsole(`Global ignore pattern '${pattern}' already exists.`, 'warning');
        return;
    }

    existing.push(pattern);
    const value = existing.join('\n');

    const success = await runSvn(['propset', 'svn:global-ignores', value, target]);
    if (success) {
        logToConsole(`Added global ignore pattern: ${pattern}`, 'success');
        if (input) input.value = '';
    }
}

// =============================================
// === Patch Create / Apply (added to Export/Import) ===
// =============================================
function renderExportImportViewExtended() {
    // This is appended after the Export/Import view
    let html = '';

    // === Patch Create Section ===
    html += `<div class="section-label">Create Patch</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Generate Patch from Working Copy</span>
                <span class="settings-desc">Create a unified diff patch file from all uncommitted changes</span>
            </div>
            <button class="btn-primary" onclick="createPatch()">Create Patch</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Patch Specific Files</span>
                <span class="settings-desc">Create patch only for selected files (comma-separated)</span>
            </div>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="text" id="patch-files" class="auth-form-input" style="flex: 2; min-width: 200px;" placeholder="file1.js, src/file2.py (empty = all changes)">
            <button class="btn-secondary" onclick="createPatchForFiles()">Create Selective Patch</button>
        </div>
    </div>`;

    // === Patch Apply Section ===
    html += `<div class="section-label">Apply Patch</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Apply Patch File</span>
                <span class="settings-desc">Apply a unified diff patch to the working copy</span>
            </div>
            <button class="btn-primary" onclick="applyPatch()">Select & Apply Patch</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Dry Run</span>
                <span class="settings-desc">Preview what the patch would change without actually applying it</span>
            </div>
            <button class="btn-secondary" onclick="applyPatch(true)">Dry Run</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">Reverse Patch</span>
                <span class="settings-desc">Undo a previously applied patch</span>
            </div>
            <button class="btn-secondary" onclick="applyPatch(false, true)">Reverse Apply</button>
        </div>
    </div>`;

    return html;
}

async function createPatch() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return alert('No project selected.');

    const result = await runSvnSilent(['diff']);
    if (!result || !result.output || !result.output.trim()) {
        logToConsole('No changes detected — cannot create patch.', 'warning');
        return;
    }

    const dialogResult = await window.api.saveFileDialog('changes.patch');
    if (!dialogResult.path) return;

    const writeResult = await window.api.writeFile(dialogResult.path, result.output);
    if (writeResult.success) {
        logToConsole(`Patch saved to: ${dialogResult.path}`, 'success');
    } else {
        logToConsole(`Failed to save patch: ${writeResult.error}`, 'error');
    }
}

async function createPatchForFiles() {
    const filesInput = document.getElementById('patch-files');
    const filesStr = filesInput ? filesInput.value.trim() : '';

    if (!filesStr) {
        return createPatch();
    }

    const files = filesStr.split(',').map(f => f.trim()).filter(f => f);
    const result = await runSvnSilent(['diff', ...files]);

    if (!result || !result.output || !result.output.trim()) {
        logToConsole('No changes detected for specified files.', 'warning');
        return;
    }

    const dialogResult = await window.api.saveFileDialog('changes.patch');
    if (!dialogResult.path) return;

    const writeResult = await window.api.writeFile(dialogResult.path, result.output);
    if (writeResult.success) {
        logToConsole(`Patch saved to: ${dialogResult.path}`, 'success');
    } else {
        logToConsole(`Failed to save patch: ${writeResult.error}`, 'error');
    }
}

async function applyPatch(dryRun = false, reverse = false) {
    const dialogResult = await window.api.openFileDialog();
    if (!dialogResult.path) return;

    const args = ['patch', dialogResult.path];
    if (dryRun) args.push('--dry-run');
    if (reverse) args.push('--reverse-diff');

    const label = dryRun ? 'Patch dry-run' : (reverse ? 'Reverse patch' : 'Apply patch');
    logToConsole(`${label}: ${dialogResult.path}`, 'system');

    const success = await runSvn(args);
    if (success) {
        if (dryRun) {
            logToConsole('Dry run completed — no changes applied.', 'success');
        } else {
            logToConsole(`Patch ${reverse ? 'reversed' : 'applied'} successfully.`, 'success');
            refreshStatus();
        }
    }
}

// Start
init();
