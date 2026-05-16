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
        theme: 'dark',
        language: 'en'
    },

    // Externals
    externals: [],
    externalsTarget: '.',
    externalsRawMode: false,

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
    patchContent: '',

    // Commit filter
    commitFilter: '',

    // Shelve
    shelveList: [],

    // Repo browser
    repoBrowserRoot: '',            // normalized root URL user is browsing
    repoBrowserTree: {},            // url → entries[] (lazy-loaded per folder)
    repoBrowserExpanded: new Set(), // set of expanded dir URLs
    repoBrowserLoading: new Set(),  // urls currently fetching (for spinner)

    // Log compare
    logSelectedRevisions: new Set(),

    // Placeholder management
    placeholderEnabled: false,
    placeholderStats: null,
};

// UI Elements
const elements = {
    contentArea: document.getElementById('main-view'),
    pageTitle: document.getElementById('page-title'),
    consoleLog: document.getElementById('console-log'),
    navMenu: document.getElementById('nav-menu'),
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
    initLanguage(state.settings.language);
    // Apply saved theme on startup — previously applyTheme was only wired
    // through the Settings form, so a saved non-default theme silently
    // reverted to CSS defaults on every launch.
    applyTheme(state.settings.theme || 'dark');
    renderSidebar();
    localizeStaticHTML();
    bindEvents();
    bindSvnOutputStream();
    bindFileWatcher();
    bindKeyboardShortcuts();
    bindOpenWithArgs();
    await loadProjects();
    // Re-apply translated title after projects load (HTML has English default)
    const titleKeys = { 'status': 'view.status' };
    if (titleKeys[state.currentView]) {
        elements.pageTitle.textContent = t(titleKeys[state.currentView]);
    }

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

    // Signal init complete — process any queued open-with-args
    onInitComplete();
}

// === Localize static HTML elements (modals, labels) ===
function localizeStaticHTML() {
    const map = {
        '#modal-title': 'modal.commitChanges',
        '#btn-confirm-commit': 'btn.confirmCommit',
        '#commit-message': { attr: 'placeholder', key: 'modal.enterCommitMessage' },
        '#checkout-modal .modal-header h2': 'modal.svnCheckout',
        '#btn-confirm-checkout': 'nav.checkout',
        '#auth-modal .modal-header h2': 'modal.svnAuth',
        '#auth-modal .modal-info': 'modal.credentialsRequired',
        '#btn-save-auth': 'btn.saveCredentials',
        '#diff-modal-title': 'modal.diffViewer',
        '#btn-refresh': 'btn.refresh',
        '#current-repo': 'msg.notConnected',
        '#operation-label': 'op.processing',
    };
    for (const [sel, val] of Object.entries(map)) {
        const el = document.querySelector(sel);
        if (!el) continue;
        if (typeof val === 'object') {
            el.setAttribute(val.attr, t(val.key));
        } else {
            el.textContent = t(val);
        }
    }
    // Checkout modal labels
    const checkoutLabels = document.querySelectorAll('#checkout-modal .input-group label');
    if (checkoutLabels[0]) checkoutLabels[0].textContent = t('modal.repoUrl');
    if (checkoutLabels[1]) checkoutLabels[1].textContent = t('modal.localPath');
    // Auth modal labels
    const authLabels = document.querySelectorAll('#auth-modal .input-group label');
    if (authLabels[0]) authLabels[0].textContent = t('modal.repoOrGlobal');
    if (authLabels[1]) authLabels[1].textContent = t('modal.username');
    if (authLabels[2]) authLabels[2].textContent = t('modal.password');
    // Diff legend
    const legends = document.querySelectorAll('.diff-legend .legend-item');
    if (legends[0]) legends[0].textContent = t('modal.added');
    if (legends[1]) legends[1].textContent = t('modal.removed');
    if (legends[2]) legends[2].textContent = t('modal.changed');
    // Diff mode buttons
    const diffBtns = document.querySelectorAll('.diff-mode-toggle button');
    if (diffBtns[0]) diffBtns[0].textContent = t('modal.inline');
    if (diffBtns[1]) diffBtns[1].textContent = t('modal.sideBySide');
    // Modal cancel/close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        if (btn.textContent.trim() === 'Cancel' || btn.textContent.trim() === '취소') {
            btn.textContent = t('btn.cancel');
        }
    });
    // Checkout modal footer buttons
    const checkoutFooterBtns = document.querySelectorAll('#checkout-modal .modal-footer button');
    if (checkoutFooterBtns[0]) checkoutFooterBtns[0].textContent = t('welcome.openExisting');
    // Browse button
    const btnBrowseLocal = document.getElementById('btn-browse-local');
    if (btnBrowseLocal) btnBrowseLocal.textContent = t('btn.browse');
    // Copy button in diff
    const copyBtn = document.querySelector('.diff-toolbar-right .btn-secondary');
    if (copyBtn && copyBtn.textContent.trim() === 'Copy') copyBtn.textContent = t('btn.copy');
}

// === Dynamic Sidebar Rendering ===
function renderSidebar() {
    const navSections = [
        { key: 'nav.section.core', items: [
            { id: 'btn-status', icon: '📊', key: 'nav.status', active: true },
            { id: 'btn-commit-view', icon: '📤', key: 'nav.commit' },
            { id: 'btn-revert-view', icon: '🔄', key: 'nav.revert' },
            { id: 'btn-update-all', icon: '📥', key: 'nav.updateAll' },
            { id: 'btn-log', icon: '📜', key: 'nav.log' },
        ] },
        { key: 'nav.section.browse', items: [
            { id: 'btn-tree', icon: '📁', key: 'nav.tree' },
            { id: 'btn-repo-browser', icon: '🌐', key: 'nav.repoBrowser' },
            { id: 'btn-search', icon: '🔍', key: 'nav.search' },
            { id: 'btn-blame', icon: '👤', key: 'nav.blame' },
        ] },
        { key: 'nav.section.manage', items: [
            { id: 'btn-checkout', icon: '🚀', key: 'nav.checkout' },
            { id: 'btn-branch', icon: '🌿', key: 'nav.branch' },
            { id: 'btn-externals', icon: '🔗', key: 'nav.externals' },
            { id: 'btn-auth', icon: '🔑', key: 'nav.auth' },
            { id: 'btn-properties', icon: '📋', key: 'nav.properties' },
            { id: 'btn-ignore', icon: '🚫', key: 'nav.ignore' },
            { id: 'btn-lock', icon: '🔒', key: 'nav.lock' },
        ] },
        { key: 'nav.section.advanced', items: [
            { id: 'btn-merge', icon: '🔀', key: 'nav.merge' },
            { id: 'btn-export', icon: '📦', key: 'nav.export' },
            { id: 'btn-shelve', icon: '📌', key: 'nav.shelve' },
            { id: 'btn-tools', icon: '🛠️', key: 'nav.tools' },
        ] },
    ];
    const footerItems = [
        { id: 'btn-settings', icon: '⚙️', key: 'nav.settings' },
    ];

    const activeView = state.currentView;
    const renderItem = (item) => {
        const viewName = item.id.replace('btn-', '');
        const isActive = (viewName === activeView) || (item.active && activeView === 'status' && viewName === 'status');
        return `<button class="nav-item${isActive ? ' active' : ''}" id="${item.id}">
            <span class="icon">${item.icon}</span> ${t(item.key)}
        </button>`;
    };

    let html = '';
    for (const section of navSections) {
        html += `<div class="nav-section-title">${t(section.key)}</div>`;
        for (const item of section.items) {
            html += renderItem(item);
        }
    }
    html += '<div class="nav-spacer"></div>';
    for (const item of footerItems) {
        html += renderItem(item);
    }

    elements.navMenu.innerHTML = html;
    bindNavEvents();

    // Update static HTML elements that live outside the dynamic sidebar
    const repoLabel = document.querySelector('.repo-info h3');
    if (repoLabel) repoLabel.textContent = t('msg.repository');
    const btnBrowse = document.getElementById('btn-browse');
    if (btnBrowse) btnBrowse.textContent = t('btn.changeRepo');
    const consoleSpan = document.querySelector('#panel-header-toggle > span');
    if (consoleSpan) consoleSpan.innerHTML = `${t('msg.consoleOutput')} <span id="console-toggle-icon">▼</span>`;
}

function bindNavEvents() {
    const navButtons = elements.navMenu.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const view = btn.id.replace('btn-', '');
            if (view === 'update-all') runSvn(['update']);
            else if (view === 'checkout') elements.checkoutModal.classList.remove('hidden');
            else switchView(view);
        });
    });
}

async function loadSettings() {
    try {
        const saved = await window.api.loadSettings();
        if (saved && typeof saved === 'object') {
            state.settings = { ...state.settings, ...saved };
            state.logLimit = state.settings.logLimit || 20;
        }
        state.placeholderEnabled = !!state.settings.placeholderEnabled;
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
            // Re-check after debounce — an operation may have started in the
            // intervening window; firing refreshStatus now would log "Busy".
            if (state.currentOperation || state.isScanning) return;
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
        // Always reflect the authoritative result. Previously a failure
        // left state.watcherActive at its prior (possibly true) value —
        // so after switching to a project where fs.watch() errored, the
        // renderer kept forwarding file-changed events for the old
        // project as if the watcher were still live.
        state.watcherActive = !!(result && result.success);
        if (state.watcherActive) {
            logToConsole('File watcher started.', 'success');
        } else {
            logToConsole(`Watcher failed: ${(result && result.error) || 'unknown error'}`, 'warning');
        }
    } catch (err) {
        state.watcherActive = false;
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

// === Open With Args (Finder Quick Actions / command-line) ===
let _initComplete = false;
let _pendingOpenArgsQueue = [];
let _processingOpenArgs = false;

function bindOpenWithArgs() {
    if (!window.api.onOpenWithArgs) return;
    window.api.onOpenWithArgs((args) => {
        _pendingOpenArgsQueue.push(args);
        if (_initComplete) {
            drainPendingOpenArgs();
        }
    });
}

async function drainPendingOpenArgs() {
    if (_processingOpenArgs) return;
    _processingOpenArgs = true;
    try {
        while (_pendingOpenArgsQueue.length > 0) {
            const args = _pendingOpenArgsQueue.shift();
            await handleOpenWithArgs(args);
        }
    } finally {
        _processingOpenArgs = false;
    }
}

function onInitComplete() {
    _initComplete = true;
    // Tell main process renderer is ready — main flushes its own queue
    if (window.api.rendererReady) {
        window.api.rendererReady().catch(() => {});
    }
    drainPendingOpenArgs();
}

async function handleOpenWithArgs(args) {
    logToConsole(`Open request: ${JSON.stringify(args)}`, 'system');

    // Quick action report from shell scripts (status/log/etc.)
    if (args.qa) {
        const label = ({
            status: '📊 Quick Status',
            log: '📜 Quick Log',
            commit: '📤 Quick Commit',
            update: '📥 Quick Update',
            cleanup: '🧹 Quick Cleanup',
        })[args.qa] || `⚡ Quick Action (${args.qa})`;
        logToConsole(`${label} — result:`, 'success');
        if (args.qaMsg) {
            for (const line of args.qaMsg.split('\n')) {
                if (line.trim()) logToConsole(line, 'system');
            }
        } else {
            logToConsole('(no output)', 'system');
        }
    }

    if (args.folderPath) {
        // Wait for any in-progress operation
        if (state.currentOperation) await waitForOperation();

        const existingIndex = state.projects.findIndex(p => p.path === args.folderPath);

        if (existingIndex >= 0) {
            selectProject(existingIndex);
            logToConsole(`Switched to project: ${state.projects[existingIndex].name}`, 'success');
        } else {
            const folderName = args.folderPath.split('/').pop() || 'Untitled Project';
            const valData = await window.api.validateRepo(args.folderPath);

            let repoUrl = '';
            if (valData.isValid) {
                try {
                    const infoResult = await window.api.runSvn(['info'], args.folderPath, null);
                    if (infoResult.success) {
                        const urlMatch = infoResult.output.match(/^URL:\s*(.+)$/m);
                        if (urlMatch) repoUrl = urlMatch[1].trim();
                    }
                } catch (e) { /* ignore */ }
            }

            await window.api.saveProject({ name: folderName, path: args.folderPath, url: repoUrl });
            await loadProjects(args.folderPath);
            logToConsole(`Added project from Finder: ${folderName}`, 'success');
        }

        // Wait for refreshStatus to complete before switching view
        if (state.currentOperation || state.isScanning) await waitForOperation();
    }

    if (args.view) {
        await switchView(args.view);
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
    elements.navMenu.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');
}

function openShortcutsModal() {
    const container = document.getElementById('shortcuts-modal-content');
    if (container) {
        container.innerHTML = `
            <div class="modal-header">
                <h2>${t('modal.keyboardShortcuts')}</h2>
                <button class="close-modal" onclick="closeShortcutsModal()">×</button>
            </div>
            <div class="shortcuts-body">
                <div class="shortcuts-section">
                    <h3>${t('shortcuts.navigation')}</h3>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>1</kbd><span>${t('shortcuts.status')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>2</kbd><span>${t('shortcuts.commit')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>3</kbd><span>${t('shortcuts.revert')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>4</kbd><span>${t('shortcuts.log')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>5</kbd><span>${t('shortcuts.tree')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>6</kbd><span>${t('shortcuts.auth')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>7</kbd><span>${t('shortcuts.properties')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>8</kbd><span>${t('shortcuts.branch')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>9</kbd><span>${t('shortcuts.settings')}</span></div>
                </div>
                <div class="shortcuts-section">
                    <h3>${t('shortcuts.actions')}</h3>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>R</kbd><span>${t('shortcuts.refresh')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>U</kbd><span>${t('shortcuts.updateAll')}</span></div>
                    <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Enter</kbd><span>${t('shortcuts.commitInView')}</span></div>
                    <div class="shortcut-row"><kbd>Escape</kbd><span>${t('shortcuts.closeModals')}</span></div>
                    <div class="shortcut-row"><kbd>?</kbd><span>${t('shortcuts.showHelp')}</span></div>
                </div>
            </div>`;
    }
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

async function openExistingProject() {
    logToConsole('Selecting directory...', 'system');
    const data = await window.api.browseFolder();
    if (!data.path) return;

    const cleanPath = data.path.replace(/\/+$/, '');
    const folderName = cleanPath.split('/').pop() || 'Untitled Project';
    const valData = await window.api.validateRepo(cleanPath);

    if (!valData.isValid) {
        if (!confirm(t('welcome.notSvnConfirm', { name: folderName }))) return;
    }

    // Auto-detect URL via svn info
    let repoUrl = '';
    if (valData.isValid) {
        try {
            const infoResult = await window.api.runSvn(['info'], cleanPath, null);
            if (infoResult.success) {
                const urlMatch = infoResult.output.match(/^URL:\s*(.+)$/m);
                if (urlMatch) repoUrl = urlMatch[1].trim();
            }
        } catch (e) { /* ignore */ }
    }

    await window.api.saveProject({ name: folderName, path: cleanPath, url: repoUrl });
    await loadProjects(cleanPath);
    logToConsole(`Added project: ${folderName}`, 'success');
}

async function loadProjects(preferredPath) {
    try {
        state.projects = await window.api.loadProjects();
        if (state.projects.length > 0) {
            let targetIdx = 0;
            if (preferredPath) {
                const found = state.projects.findIndex(p => p.path === preferredPath);
                if (found >= 0) targetIdx = found;
            } else if (state.selectedProjectIndex >= 0 && state.selectedProjectIndex < state.projects.length) {
                targetIdx = state.selectedProjectIndex;
            }
            selectProject(targetIdx);
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
        // Clear per-project stale view state so old data doesn't leak into
        // the newly-selected project's views (blame/tree/props/branch/etc).
        state.blameFile = '';
        state.blameData = [];
        state.treeData = {};
        state.treeExpanded = new Set();
        state.treeFolderStatus = {};
        state.properties = [];
        state.branchInfo = null;
        state.branchList = [];
        state.tagList = [];
        state.externals = [];
        state.searchResults = [];
        state.logEntries = [];
        state.logPage = 1;
        state.lockFiles = [];
        state.shelveList = [];
        state.changelists = {};
        state.mergePreview = [];
        state.repoBrowserRoot = '';
        state.repoBrowserTree = {};
        state.repoBrowserExpanded = new Set();
        state.repoBrowserLoading = new Set();
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
        // No projects left — stop the file watcher so main.js doesn't
        // keep emitting change events for a directory the user just
        // removed from the project list.
        if (state.watcherActive) {
            stopWatcher();
        }
        state.selectedProjectIndex = -1;
        state.workingCopy = [];
        elements.currentRepo.textContent = 'Not Connected';
        renderTabs();
        render();
    }
}

function renderTabs() {
    const addButton = '<button class="add-tab" id="add-project-btn">+</button>';
    elements.projectTabs.innerHTML = state.projects.map((p, i) => `
        <div class="tab ${i === state.selectedProjectIndex ? 'active' : ''}" onclick="selectProject(${i})">
            <span>📦 ${escapeHtml(p.name || 'Untitled')}</span>
            <button class="close-tab" onclick="deleteProject(${i}, event)">×</button>
        </div>
    `).join('') + addButton;

    // Bind plus button after innerHTML update
    document.getElementById('add-project-btn').onclick = () => {
        elements.checkoutModal.classList.remove('hidden');
    };
}

function bindEvents() {
    // Nav events are bound in renderSidebar() → bindNavEvents()

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
        } else if (state.currentView === 'externals') {
            fetchExternals();
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
        if (state.selectedFiles.size === 0) {
            alert('Please select files to update.');
            return;
        }
        runSvn(['update', ...Array.from(state.selectedFiles)]);
    });

    document.getElementById('btn-bulk-revert').addEventListener('click', () => {
        if (state.selectedFiles.size === 0) {
            alert('Please select files to revert.');
            return;
        }
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
        const url = document.getElementById('checkout-url').value.trim();
        const path = document.getElementById('checkout-path').value.trim().replace(/\/+$/, '');
        if (!url || !path) return alert('Please enter both URL and Path');

        closeModal();
        const success = await runSvn(['checkout', url, path], url);
        if (success) {
            const projectName = path.split('/').pop() || 'New Repo';
            await window.api.saveProject({ name: projectName, path, url });
            await loadProjects(path);
        }
    });

    // Native Picker
    document.getElementById('btn-browse-local').addEventListener('click', async () => {
        await openNativeDirPicker();
    });

    // Sidebar Browse button
    document.getElementById('btn-browse').addEventListener('click', () => openExistingProject());

    // Auth Modal
    document.getElementById('btn-save-auth').addEventListener('click', async () => {
        const url = document.getElementById('auth-url').value.trim();
        const user = document.getElementById('auth-username').value.trim();
        const pass = document.getElementById('auth-password').value;
        if (!url) return alert('Please enter a URL (or "global").');
        if (!user) return alert('Please enter a username.');

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

async function switchView(view) {
    state.currentView = view;
    const titleKeys = {
        'status': 'view.status',
        'log': 'view.log',
        'commit-view': 'view.commitView',
        'revert-view': 'view.revertView',
        'auth': 'view.auth',
        'tree': 'view.tree',
        'properties': 'view.properties',
        'branch': 'view.branch',
        'lock': 'view.lock',
        'blame': 'view.blame',
        'merge': 'view.merge',
        'export': 'view.export',
        'search': 'view.search',
        'ignore': 'view.ignore',
        'tools': 'view.tools',
        'repo-browser': 'view.repoBrowser',
        'shelve': 'view.shelve',
        'settings': 'view.settings',
        'externals': 'view.externals'
    };
    elements.pageTitle.textContent = titleKeys[view] ? t(titleKeys[view]) : view.charAt(0).toUpperCase() + view.slice(1);
    // Update sidebar active state
    if (elements.navMenu) {
        elements.navMenu.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById('btn-' + view);
        if (activeBtn) activeBtn.classList.add('active');
    }
    if (view === 'log') {
        state.logPage = 1;
        await fetchLog();
    } else if (view === 'auth') {
        await fetchAuthEntries();
    } else if (view === 'tree') {
        await fetchTree();
    } else if (view === 'properties') {
        await fetchProperties();
    } else if (view === 'branch') {
        await fetchBranchInfo();
    } else if (view === 'lock') {
        await fetchLockStatus();
    } else if (view === 'blame') {
        renderBlameView();
    } else if (view === 'merge') {
        render();
    } else if (view === 'export') {
        render();
    } else if (view === 'search') {
        render();
    } else if (view === 'ignore') {
        await fetchIgnorePatterns();
    } else if (view === 'externals') {
        await fetchExternals();
    } else if (view === 'repo-browser') {
        render();
    } else if (view === 'shelve') {
        await fetchShelveList();
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
    // Limit console entries to prevent memory bloat during long sessions
    while (elements.consoleLog.children.length > 500) {
        elements.consoleLog.removeChild(elements.consoleLog.firstChild);
    }
    elements.consoleLog.scrollTop = elements.consoleLog.scrollHeight;
}

function getOperationLabel(cmd) {
    const labelKeys = {
        'checkout': 'op.checkingOut',
        'update': 'op.updating',
        'commit': 'op.committing',
        'revert': 'op.reverting',
        'add': 'op.adding',
        'delete': 'op.deleting',
        'resolve': 'op.resolving',
        'status': 'op.scanning',
        'info': 'op.fetchingInfo',
        'log': 'op.fetchingLog',
        'diff': 'op.loadingDiff',
        'proplist': 'op.loadingProps',
        'propget': 'op.readingProp',
        'propset': 'op.settingProp',
        'propdel': 'op.deletingProp',
        'ls': 'op.listing',
        'copy': 'op.copying',
        'switch': 'op.switching',
        'lock': 'op.locking',
        'unlock': 'op.unlocking',
        'blame': 'op.loadingBlame',
        'merge': 'op.merging',
        'export': 'op.exporting',
        'import': 'op.importing',
        'cleanup': 'op.cleaning',
        'move': 'op.moving',
        'relocate': 'op.relocating',
        'changelist': 'op.processing',
        'patch': 'op.patching',
        'upgrade': 'op.upgrading',
        'shelve': 'op.shelving',
        'unshelve': 'op.unshelving'
    };
    return labelKeys[cmd] ? t(labelKeys[cmd]) : `Running svn ${cmd}...`;
}

let _operationSafetyTimer = null;
let _operationElapsedTimer = null;
let _operationStartTime = 0;

function showOperation(label) {
    state.currentOperation = label;
    _operationStartTime = Date.now();
    const overlay = document.getElementById('operation-overlay');
    const labelEl = document.getElementById('operation-label');
    if (overlay && labelEl) {
        labelEl.textContent = label;
        overlay.classList.remove('hidden');
    }
    document.querySelector('.app-container').classList.add('operation-active');

    // Auto-expand console panel so user can see real-time SVN output
    expandConsolePanel();

    // Show elapsed time on overlay after 2 seconds
    clearInterval(_operationElapsedTimer);
    _operationElapsedTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - _operationStartTime) / 1000);
        if (labelEl && state.currentOperation) {
            labelEl.textContent = `${state.currentOperation} (${elapsed}s)`;
        }
    }, 1000);

    // Safety timeout: auto-hide overlay to prevent permanent stuck state
    clearTimeout(_operationSafetyTimer);
    _operationSafetyTimer = setTimeout(() => {
        if (state.currentOperation) {
            logToConsole(`Operation "${state.currentOperation}" timed out. UI unlocked.`, 'warning');
            hideOperation();
        }
    }, 125000); // exceed main-side 60s SVN timeout + ~60s auth retry window
}

function hideOperation() {
    state.currentOperation = null;
    clearTimeout(_operationSafetyTimer);
    clearInterval(_operationElapsedTimer);
    const overlay = document.getElementById('operation-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    document.querySelector('.app-container').classList.remove('operation-active');
}

async function runSvn(command, url = null) {
    if (state.currentOperation) {
        logToConsole(`Busy: "${state.currentOperation}" in progress. Please wait.`, 'warning');
        return false;
    }

    // checkout 명령은 cwd 불필요 (새 경로에 체크아웃하므로)
    const isCheckout = command[0] === 'checkout';
    const cwd = isCheckout ? null : (state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].path : null);
    const finalUrl = url || (state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].url : null);

    showOperation(getOperationLabel(command[0]));
    logToConsole(`Executing: svn ${command.join(' ')}`, 'system');

    try {
        const result = await window.api.runSvn(command, cwd, finalUrl);

        if (result.success) {
            // Show detailed output for update commands
            if (command[0] === 'update' && result.output) {
                const lines = result.output.trim().split('\n').filter(l => l.trim());
                for (const line of lines) {
                    logToConsole(line, 'success');
                }
            }
            logToConsole('Command completed successfully.', 'success');
            hideOperation();
            // Auto-expand console panel for update commands
            if (command[0] === 'update') expandConsolePanel();
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

function expandConsolePanel() {
    const panel = document.querySelector('.bottom-panel');
    const icon = document.getElementById('console-toggle-icon');
    if (panel && panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        if (icon) icon.textContent = '▼';
    }
}

async function deleteFile(path) {
    if (state.currentOperation) {
        logToConsole(`Busy: "${state.currentOperation}" in progress. Please wait.`, 'warning');
        return;
    }

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

    let authRequired = false;
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
            // If auth failed, surface the login modal instead of retrying
            // with the same (broken) credentials — which previously spawned
            // a fire-and-forget runSvn that could recurse via runSvn's own
            // refreshStatus-on-success path.
            const errStr = (result.error || '') + (result.output || '');
            if (errStr.match(/Authentication|Authorization|Username not found/)) {
                authRequired = true;
            }
        }
    } finally {
        state.isScanning = false;
        hideOperation();
        render();
        if (authRequired) {
            state.lastFailedCommand = { command: ['status'], url: project.url };
            const urlInput = document.getElementById('auth-url');
            if (urlInput) urlInput.value = project.url || 'global';
            if (elements.authModal) elements.authModal.classList.remove('hidden');
            logToConsole('Authentication required. Opening login window...', 'warning');
        }
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
        elements.contentArea.innerHTML = `
            <div class="welcome-screen">
                <div class="welcome-icon">🪼</div>
                <h2>${t('welcome.title')}</h2>
                <p class="welcome-subtitle">${t('welcome.subtitle')}</p>
                <div class="welcome-actions">
                    <button class="btn-welcome" id="btn-welcome-open">
                        <span class="welcome-btn-icon">📂</span>
                        <span class="welcome-btn-title">${t('welcome.openExisting')}</span>
                        <span class="welcome-btn-desc">${t('welcome.openExistingDesc')}</span>
                    </button>
                    <button class="btn-welcome" id="btn-welcome-checkout">
                        <span class="welcome-btn-icon">⬇️</span>
                        <span class="welcome-btn-title">${t('welcome.checkout')}</span>
                        <span class="welcome-btn-desc">${t('welcome.checkoutDesc')}</span>
                    </button>
                </div>
            </div>`;
        document.getElementById('btn-welcome-open')?.addEventListener('click', openExistingProject);
        document.getElementById('btn-welcome-checkout')?.addEventListener('click', () => {
            elements.checkoutModal.classList.remove('hidden');
        });
        return;
    }
    if (state.isScanning) {
        elements.contentArea.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div><p>${t('msg.syncing')}</p></div>`;
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
        case 'repo-browser':
            renderRepoBrowser();
            break;
        case 'shelve':
            renderShelveView();
            break;
        case 'externals':
            renderExternalsView();
            break;
        case 'settings':
            renderSettings();
            break;
        default:
            elements.contentArea.innerHTML = `<div class="empty-state"><p>${t('msg.viewNotFound')}</p></div>`;
    }
}

function renderStatus() {
    if (state.workingCopy.length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>${t('msg.workspaceClean')}</p></div>`;
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
                `<button class="btn-primary" onclick="runSvn(['add', '${ep}'])">${t('btn.add')}</button>
                         <button class="btn-secondary" onclick="quickAddIgnoreFromStatus('${ep}')">${t('btn.ignore')}</button>
                         <button class="btn-secondary" onclick="if(confirm('${t('msg.confirmDelete')} ${ep}?')) deleteFile('${ep}')">${t('btn.delete')}</button>` :
                file.status === 'missing' ?
                `<button class="btn-secondary" onclick="runSvn(['delete', '${ep}'])">${t('btn.remove')}</button>
                         <button class="btn-secondary" onclick="if(confirm('${t('msg.confirmRevert')} ${ep}?')) runSvn(['revert', '-R', '${ep}'])">${t('btn.revert')}</button>` :
                file.status === 'conflict' ?
                `<button class="btn-secondary" onclick="showDiff('${ep}')">${t('btn.diff')}</button>
                         <button class="btn-primary" onclick="runSvn(['resolve', '--accept', 'working', '${ep}'])">${t('btn.resolveMine')}</button>
                         <button class="btn-secondary" onclick="runSvn(['resolve', '--accept', 'theirs-full', '${ep}'])">${t('btn.resolveTheirs')}</button>
                         <button class="btn-secondary" onclick="if(confirm('${t('msg.confirmRevert')} ${ep}?')) runSvn(['revert', '-R', '${ep}'])">${t('btn.revert')}</button>` :
                `<button class="btn-secondary" onclick="showDiff('${ep}')">${t('btn.diff')}</button>
                         <button class="btn-secondary" onclick="if(confirm('${t('msg.confirmRevert')} ${ep}?')) runSvn(['revert', '-R', '${ep}'])">${t('btn.revert')}</button>`
            }
                </div>
            </div>
        `;
    });
    html += '</div>';

    // Add All Untracked button
    const untrackedFiles = state.workingCopy.filter(f => f.status === 'untracked');
    if (untrackedFiles.length > 0) {
        html += `<div class="commit-form" style="margin-top: 12px;">
            <div class="commit-form-actions">
                <button class="btn-primary" onclick="addAllUntracked()">${t('btn.add')} (${untrackedFiles.length})</button>
            </div>
        </div>`;
    }

    elements.contentArea.innerHTML = html;
}

async function addAllUntracked() {
    const untracked = state.workingCopy.filter(f => f.status === 'untracked');
    if (untracked.length === 0) return;
    if (!confirm(`Add ${untracked.length} untracked file(s) to SVN?`)) return;

    let added = 0;
    for (const file of untracked) {
        const success = await runSvn(['add', file.path]);
        if (success) added++;
    }
    logToConsole(`Added ${added}/${untracked.length} files to SVN.`, 'success');
}

// === Log View ===
function fmtLogDate(d) {
    return d.toISOString().slice(0, 10);
}

function getDefaultLogDateRange() {
    const today = new Date();
    const past = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { dateFrom: fmtLogDate(past), dateTo: fmtLogDate(today) };
}

async function fetchLog() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    // Default to last 7 days only when BOTH are empty, and persist that default
    // so the UI inputs reflect the range actually used.
    let dateFrom = state.logFilter.dateFrom;
    let dateTo = state.logFilter.dateTo;
    if (!dateFrom && !dateTo) {
        const def = getDefaultLogDateRange();
        dateFrom = def.dateFrom;
        dateTo = def.dateTo;
        state.logFilter.dateFrom = dateFrom;
        state.logFilter.dateTo = dateTo;
    }

    state.isScanning = true;
    render();

    let cmd;
    if (dateFrom || dateTo) {
        // Use server-side date range. Newest first via {to}:{from} order.
        // When only one side is set, bound the other with a sane default WITHOUT
        // mutating state.logFilter (so the user's partial input is preserved).
        const effFrom = dateFrom || '1970-01-01';
        const effTo = dateTo || fmtLogDate(new Date());
        cmd = ['log', '-r', `{${effTo}}:{${effFrom}}`, '-v'];
    } else {
        const limit = state.logPage * state.logLimit;
        cmd = ['log', '-l', String(limit), '-v'];
    }
    const success = await runSvnSilent(cmd);
    state.isScanning = false;

    if (success) {
        parseLogEntries(success.output || '');
    } else {
        state.logEntries = [];
        logToConsole('Failed to fetch log entries.', 'error');
    }
    render();
}

function applyLogDatePreset(days) {
    const today = new Date();
    const past = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    state.logFilter.dateFrom = fmtLogDate(past);
    state.logFilter.dateTo = fmtLogDate(today);
    state.logPage = 1;
    fetchLog();
}

function applyLogDatePresetAll() {
    state.logFilter.dateFrom = '';
    state.logFilter.dateTo = '';
    state.logPage = 1;
    // Skip default-injection by going through fetchLog with explicit empty,
    // but fetchLog re-applies default. Use direct command to truly fetch all.
    fetchAllLog();
}

async function fetchAllLog() {
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
        logToConsole('Failed to fetch log entries.', 'error');
    }
    render();
}

function applyLogDateInputChange() {
    const dateFrom = document.getElementById('log-filter-date-from');
    const dateTo = document.getElementById('log-filter-date-to');
    state.logFilter.dateFrom = dateFrom ? dateFrom.value : '';
    state.logFilter.dateTo = dateTo ? dateTo.value : '';
    state.logPage = 1;
    if (state.logFilter.dateFrom || state.logFilter.dateTo) {
        fetchLog();
    } else {
        fetchAllLog();
    }
}

// Wait for any in-progress operation or scanning to finish.
// Cap must exceed main-side SVN timeout (60s) with buffer so long updates
// don't race with the next command.
function waitForOperation() {
    if (!state.currentOperation && !state.isScanning) return Promise.resolve();
    return new Promise((resolve) => {
        let elapsed = 0;
        const interval = setInterval(() => {
            elapsed += 200;
            if ((!state.currentOperation && !state.isScanning) || elapsed >= 95000) {
                clearInterval(interval);
                resolve();
            }
        }, 200);
    });
}

async function runSvnSilent(command) {
    // Wait for current operation to finish instead of failing immediately
    if (state.currentOperation) {
        await waitForOperation();
    }

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
        let passedPaths = false;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('Changed paths:')) {
                inPaths = true;
                continue;
            }
            if (inPaths && line.trim() === '') {
                inPaths = false;
                passedPaths = true;
                continue;
            }
            if (inPaths) {
                const pathMatch = line.trim().match(/^([ADMR])\s+(.+)/);
                if (pathMatch) {
                    changedPaths.push({ action: pathMatch[1], path: pathMatch[2] });
                }
            } else if (passedPaths) {
                // After Changed paths section, collect message lines
                if (line.trim() !== '' || message) {
                    message += (message ? '\n' : '') + line;
                }
            } else if (!inPaths && line.trim() === '' && i > 0) {
                // No Changed paths section — blank line signals message start
                passedPaths = true;
            } else if (!inPaths && passedPaths === false && line.trim() !== '' && i > 0) {
                // Fallback: non-empty line without Changed paths section
                passedPaths = true;
                message += line;
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
    clearTimeout(_logFilterTimer);
    const def = getDefaultLogDateRange();
    state.logFilter = { keyword: '', author: '', dateFrom: def.dateFrom, dateTo: def.dateTo };
    state.logPage = 1;
    fetchLog();
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
        elements.contentArea.innerHTML = `<div class="empty-state"><p>${t('msg.noLogEntries')}</p></div>`;
        return;
    }

    const filtered = getFilteredLogEntries();
    const hasFilter = state.logFilter.keyword || state.logFilter.author || state.logFilter.dateFrom || state.logFilter.dateTo;

    let html = '';

    // Filter bar
    html += `<div class="log-filter-bar">
        <div class="log-filter-row">
            <div class="log-filter-group">
                <input type="text" id="log-filter-keyword" class="log-filter-input" placeholder="${t('log.searchKeyword')}" value="${escapeHtml(state.logFilter.keyword)}" oninput="debounceLogFilter()">
            </div>
            <div class="log-filter-group">
                <input type="text" id="log-filter-author" class="log-filter-input log-filter-author" placeholder="${t('log.author')}" value="${escapeHtml(state.logFilter.author)}" oninput="debounceLogFilter()">
            </div>
            <div class="log-filter-group log-filter-date-group">
                <span class="log-filter-label">${t('log.dateRange')}</span>
                <input type="date" id="log-filter-date-from" class="log-filter-input log-filter-date" value="${state.logFilter.dateFrom}" onchange="applyLogDateInputChange()">
                <span class="log-filter-separator">~</span>
                <input type="date" id="log-filter-date-to" class="log-filter-input log-filter-date" value="${state.logFilter.dateTo}" onchange="applyLogDateInputChange()">
            </div>
            <button class="btn-secondary btn-small" onclick="clearLogFilter()" ${hasFilter ? '' : 'disabled'}>${t('log.clear')}</button>
        </div>
        <div class="log-filter-row log-filter-presets">
            <button class="btn-secondary btn-small" onclick="applyLogDatePreset(7)">${t('log.last7days')}</button>
            <button class="btn-secondary btn-small" onclick="applyLogDatePreset(30)">${t('log.last30days')}</button>
            <button class="btn-secondary btn-small" onclick="applyLogDatePreset(90)">${t('log.last90days')}</button>
            <button class="btn-secondary btn-small" onclick="applyLogDatePresetAll()">${t('log.allDates')}</button>
        </div>
        ${hasFilter ? `<div class="log-filter-results">${t('log.showingEntries', { filtered: filtered.length, total: state.logEntries.length })}</div>` : ''}
    </div>`;

    // Compare bar (when 2 revisions selected)
    const selectedRevCount = state.logSelectedRevisions.size;
    if (selectedRevCount === 2) {
        const revArr = Array.from(state.logSelectedRevisions).sort((a, b) => a - b);
        html += `<div class="log-filter-bar" style="margin-bottom: 12px; background: rgba(var(--accent-rgb, 99, 102, 241), 0.15);">
            <div class="log-filter-row" style="justify-content: space-between;">
                <span style="color: var(--text-primary);">${t('log.revisionsSelected', { rev1: revArr[0], rev2: revArr[1] })}</span>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-primary btn-small" onclick="compareSelectedRevisions()">${t('log.compareSelected')}</button>
                    <button class="btn-secondary btn-small" onclick="state.logSelectedRevisions.clear(); render();">${t('log.clear')}</button>
                </div>
            </div>
        </div>`;
    } else if (selectedRevCount === 1) {
        html += `<div class="log-filter-bar" style="margin-bottom: 12px;">
            <div class="log-filter-row"><span style="color: var(--text-dim);">${t('log.selectOneMore', { count: selectedRevCount })}</span></div>
        </div>`;
    }

    // Remote URL Log input
    html += `<div class="log-filter-bar" style="margin-bottom: 12px;">
        <div class="log-filter-row">
            <input type="text" id="remote-log-url" class="log-filter-input" placeholder="${t('log.remoteUrlPlaceholder')}" style="flex: 2;">
            <button class="btn-secondary btn-small" onclick="fetchRemoteLog()">${t('log.remoteLog')}</button>
        </div>
    </div>`;

    // Log list
    html += '<div class="log-list">';
    if (filtered.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('log.noMatchingEntries')}</p></div>`;
    } else {
        for (const entry of filtered) {
            const shortDate = entry.date.split('(')[0].trim();
            const isRevSelected = state.logSelectedRevisions.has(entry.revision);
            html += `
                <div class="log-card">
                    <div class="log-header">
                        <label class="checkbox-container" onclick="event.stopPropagation()" style="margin-right: 8px;">
                            <input type="checkbox" ${isRevSelected ? 'checked' : ''} onchange="toggleLogRevisionSelect('${entry.revision}')">
                            <span class="checkmark"></span>
                        </label>
                        <div class="log-revision" onclick="this.closest('.log-card').querySelector('.log-details').classList.toggle('hidden')">r${entry.revision}</div>
                        <div class="log-meta">
                            <span class="log-author">${escapeHtml(entry.author)}</span>
                            <span class="log-date">${escapeHtml(shortDate)}</span>
                        </div>
                    </div>
                    <div class="log-message" onclick="this.closest('.log-card').querySelector('.log-details').classList.toggle('hidden')">${escapeHtml(entry.message || t('log.noMessage'))}</div>
                    <div class="log-actions" style="margin-top: 8px; display: flex; gap: 8px;" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" onclick="revertToRevision('${entry.revision}')">${t('log.revertToThis')}</button>
                        <button class="btn-secondary btn-small" onclick="revertRevisionChange('${entry.revision}')">${t('log.undoThisChange')}</button>
                    </div>
                    <div class="log-details hidden">
                        <div class="log-paths-title">${t('log.changedFiles', { count: entry.changedPaths.length })}</div>
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
    html += `<div class="log-load-more"><button class="btn-secondary" onclick="state.logPage++; fetchLog();">${t('log.loadMore')}</button></div>`;
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
    // escapePath is consumed inside single-quoted JS strings embedded in
    // double-quoted HTML attributes (e.g. onclick="fn('${escapePath(p)}')").
    // So it must neutralise both JS-string-breakers (\, ') AND HTML-attribute
    // -breakers (", &, <, >). Do backslash first so later replacements don't
    // get double-escaped.
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// === Commit View ===
function renderCommitView() {
    if (!state.workingCopy || state.workingCopy.length === 0) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>${t('msg.nothingToCommit')}</p></div>`;
        return;
    }

    let committable = state.workingCopy.filter(f => f.status !== 'untracked');
    let untracked = state.workingCopy.filter(f => f.status === 'untracked');

    let html = '<div class="commit-view-container">';

    // Filter bar
    html += `<div class="log-filter-bar" style="margin-bottom: 12px;">
        <div class="log-filter-row">
            <input type="text" id="commit-filter-input" class="log-filter-input" placeholder="${t('search.placeholder')}" value="${escapeHtml(state.commitFilter || '')}" oninput="onCommitFilterChange()">
            <button class="btn-secondary btn-small" onclick="clearCommitFilter()" ${state.commitFilter ? '' : 'disabled'}>${t('btn.clear')}</button>
        </div>
    </div>`;

    // Apply filter
    const filterText = (state.commitFilter || '').toLowerCase();
    if (filterText) {
        committable = committable.filter(f => f.path.toLowerCase().includes(filterText));
        untracked = untracked.filter(f => f.path.toLowerCase().includes(filterText));
    }

    if (untracked.length > 0) {
        html += `<div class="section-label">${t('label.untrackedFiles')}
            <button class="btn-primary btn-small" style="margin-left: 12px;" onclick="addAllUntracked()">${t('btn.add')} (${untracked.length})</button>
        </div>`;
        html += '<div class="status-list">';
        untracked.forEach(file => {
            const ep = escapePath(file.path);
            html += `
                <div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-untracked">?</span>
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                    <div class="file-actions">
                        <button class="btn-primary" onclick="runSvn(['add', '${ep}'])">${t('btn.add')}</button>
                    </div>
                </div>`;
        });
        html += '</div>';
    }

    if (committable.length > 0) {
        html += `<div class="section-label">${t('label.committableFiles')}${filterText ? ` (${committable.length})` : ''}</div>`;
        html += '<div class="status-list">';
        committable.forEach((file, index) => {
            const ep = escapePath(file.path);
            const isSelected = state.selectedFiles.has(file.path);
            html += `
                <div class="status-card ${isSelected ? 'selected' : ''}" style="animation-delay: ${index * 0.05}s" onclick="toggleFileSelection('${ep}'); render();">
                    <div class="file-info">
                        <label class="checkbox-container" onclick="event.stopPropagation()">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${ep}'); render();">
                            <span class="checkmark"></span>
                        </label>
                        <span class="file-badge badge-${file.status}">${file.status.charAt(0).toUpperCase()}</span>
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary" onclick="showDiff('${ep}')">${t('btn.diff')}</button>
                    </div>
                </div>`;
        });
        html += '</div>';

        // Changelist options
        const clNames = Object.keys(state.changelists);
        let clOptions = '';
        if (clNames.length > 0) {
            clOptions = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                <span style="color: var(--text-dim); font-size: 13px;">${t('label.commitChangelist')}</span>
                ${clNames.map(cl => `<button class="btn-secondary btn-small" onclick="commitChangelist('${escapeHtml(cl)}')">${escapeHtml(cl)} (${state.changelists[cl].length})</button>`).join('')}
            </div>`;
        }

        html += `
            <div class="commit-form">
                ${clOptions}
                <textarea id="inline-commit-message" class="commit-textarea" placeholder="${t('modal.enterCommitMessage')}"></textarea>
                <div class="commit-form-actions">
                    <button class="btn-secondary" onclick="selectAllCommittable()">${t('btn.selectAll')}</button>
                    <button class="btn-primary" onclick="inlineCommit()">${t('btn.commitSelected')} (${state.selectedFiles.size})</button>
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
        elements.contentArea.innerHTML = `<div class="empty-state"><p>${t('msg.nothingToRevert')}</p></div>`;
        return;
    }

    const revertable = state.workingCopy.filter(f => f.status !== 'untracked');
    const untracked = state.workingCopy.filter(f => f.status === 'untracked');

    let html = '<div class="revert-view-container">';

    if (revertable.length > 0) {
        html += `<div class="section-label">${t('revert.modifiedFiles')}</div>`;
        html += '<div class="status-list">';
        revertable.forEach((file, index) => {
            const isSelected = state.selectedFiles.has(file.path);
            const ep = escapePath(file.path);
            html += `
                <div class="status-card ${isSelected ? 'selected' : ''}" style="animation-delay: ${index * 0.05}s" onclick="toggleFileSelection('${ep}'); render();">
                    <div class="file-info">
                        <label class="checkbox-container" onclick="event.stopPropagation()">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFileSelection('${ep}'); render();">
                            <span class="checkmark"></span>
                        </label>
                        <span class="file-badge badge-${file.status}">${file.status.charAt(0).toUpperCase()}</span>
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary" onclick="showDiff('${ep}')">${t('btn.diff')}</button>
                        <button class="btn-secondary" style="color: var(--error);" onclick="if(confirm('Revert ${ep}?')) runSvn(['revert', '-R', '${ep}'])">Revert</button>
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
        html += `<div class="section-label">${t('revert.untrackedFiles')}</div>`;
        html += '<div class="status-list">';
        untracked.forEach(file => {
            const ep = escapePath(file.path);
            html += `
                <div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-untracked">?</span>
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                    <div class="file-actions">
                        <button class="btn-secondary" style="color: var(--error);" onclick="if(confirm('Delete ${ep}?')) deleteFile('${ep}')">Delete</button>
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
    const externalTool = state.settings.externalDiffTool || 'builtin';

    if (externalTool !== 'builtin') {
        await openExternalDiff(filePath, externalTool);
        return;
    }

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

async function openExternalDiff(filePath, tool) {
    const cwd = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].path : null;
    const url = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].url : null;

    // Get base version content
    logToConsole(`Getting base version of ${filePath}...`, 'system');
    const baseResult = await window.api.runSvn(['cat', '-r', 'BASE', filePath], cwd, url);
    if (!baseResult || !baseResult.success) {
        logToConsole('Failed to get base version of file.', 'error');
        return;
    }

    // Write base content to temp file
    const baseTmpPath = cwd + '/.svn-shelves/.diff-base-' + filePath.replace(/\//g, '_');
    const baseWrite = await window.api.writeFile(baseTmpPath, baseResult.output || '');
    if (!baseWrite || !baseWrite.success) {
        logToConsole(`Failed to create temp file: ${baseWrite && baseWrite.error ? baseWrite.error : 'write failed'}`, 'error');
        return;
    }

    const workingPath = cwd + '/' + filePath;
    const toolCommands = {
        'opendiff': ['opendiff', baseTmpPath, workingPath],
        'vscode': ['code', '--diff', baseTmpPath, workingPath],
        'bbedit': ['bbedit', '--diff', baseTmpPath, workingPath],
        'kdiff3': ['kdiff3', baseTmpPath, workingPath]
    };

    const cmd = toolCommands[tool];
    if (!cmd) {
        logToConsole(`Unknown diff tool: ${tool}`, 'error');
        return;
    }

    try {
        const result = await window.api.openExternalDiff({ tool, basePath: baseTmpPath, workingPath });
        if (result && result.success) {
            logToConsole(`Opened ${tool} for ${filePath}`, 'success');
        } else {
            logToConsole(`Failed to open ${tool}: ${result ? result.error : 'unknown error'}. Falling back to built-in viewer.`, 'warning');
            // Fallback: show built-in diff
            const exOld = state.settings.externalDiffTool;
            state.settings.externalDiffTool = 'builtin';
            await showDiff(filePath);
            state.settings.externalDiffTool = exOld;
        }
    } catch (e) {
        logToConsole(`External diff error: ${e.message}. Falling back to built-in viewer.`, 'warning');
        const exOld = state.settings.externalDiffTool;
        state.settings.externalDiffTool = 'builtin';
        await showDiff(filePath);
        state.settings.externalDiffTool = exOld;
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

        if (line.startsWith('-') && !line.startsWith('--- ')) {
            let removeCount = 0;
            let addCount = 0;
            let j = i;
            while (j < lines.length && lines[j].startsWith('-') && !lines[j].startsWith('--- ')) {
                removeCount++;
                j++;
            }
            while (j < lines.length && lines[j].startsWith('+') && !lines[j].startsWith('+++ ')) {
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

        if (line.startsWith('+') && !line.startsWith('+++ ')) {
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

        if (line.startsWith('-') && !line.startsWith('--- ')) {
            let removeCount = 0;
            let addCount = 0;
            let j = i;
            while (j < lines.length && lines[j].startsWith('-') && !lines[j].startsWith('--- ')) { removeCount++; j++; }
            while (j < lines.length && lines[j].startsWith('+') && !lines[j].startsWith('+++ ')) { addCount++; j++; }

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

        if (line.startsWith('+') && !line.startsWith('+++ ')) {
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
        <div class="section-label">${t('auth.addCredentials')}</div>
        <div class="auth-form">
            <div class="auth-form-row">
                <input type="text" id="auth-new-url" class="auth-form-input" placeholder="${t('auth.repoUrlPlaceholder')}">
                <input type="text" id="auth-new-username" class="auth-form-input" placeholder="${t('auth.usernamePlaceholder')}">
                <input type="password" id="auth-new-password" class="auth-form-input" placeholder="${t('auth.passwordPlaceholder')}">
                <button class="btn-primary btn-small" onclick="saveNewAuth()">${t('btn.save')}</button>
            </div>
        </div>`;

    html += `<div class="section-label">${t('auth.savedCredentials', { count: state.authEntries.length })}</div>`;

    if (state.authEntries.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('auth.noSavedCredentials')}</p></div>`;
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
                                <button class="btn-primary btn-small" onclick="updateAuth('${escapeHtml(entry.urlKey)}')">${t('btn.save')}</button>
                                <button class="btn-secondary btn-small" onclick="cancelEditAuth()">${t('btn.cancel')}</button>
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
                            <button class="btn-secondary btn-small" onclick="testAuth('${escapeHtml(entry.urlKey)}')">${t('auth.check')}</button>
                            <button class="btn-secondary btn-small" onclick="editAuth('${escapeHtml(entry.urlKey)}')">${t('btn.edit')}</button>
                            <button class="btn-secondary btn-small" style="color: var(--error);" onclick="deleteAuthEntry('${escapeHtml(entry.urlKey)}')">${t('btn.delete')}</button>
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
    if (state.currentOperation) {
        logToConsole(`Busy: "${state.currentOperation}" in progress. Please wait.`, 'warning');
        return;
    }

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

    if (state.currentOperation) await waitForOperation();

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
    html += `<div class="tree-node tree-node-root" data-path="${escapeHtml(rootPath)}" onclick="toggleTreeFolder('${escapeHtml(rootPath)}')">
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

function formatFileSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatMtime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    if (sameYear) {
        return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function renderTreeChildren(parentPath, depth) {
    const items = state.treeData[parentPath];
    if (!items || items.length === 0) return '';

    let html = '';
    const indent = depth * 24;

    for (const item of items) {
        const safePath = escapeHtml(item.path);
        const mtime = formatMtime(item.mtime);
        const mtimeHtml = mtime ? `<span class="tree-meta-mtime">${mtime}</span>` : '';

        if (item.type === 'directory') {
            const isExpanded = state.treeExpanded.has(item.path);
            const children = state.treeData[item.path];
            const countHtml = children ? `<span class="tree-meta-count">${children.length} item${children.length !== 1 ? 's' : ''}</span>` : '';
            html += `<div class="tree-node" data-path="${safePath}" style="padding-left: ${indent}px" onclick="toggleTreeFolder('${safePath}')">
                <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">&#9654;</span>
                <span class="tree-icon">${isExpanded ? '📂' : '📁'}</span>
                <span class="tree-name">${escapeHtml(item.name)}</span>
                <span class="tree-meta">${countHtml}${mtimeHtml}</span>
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
            const sizeHtml = item.size != null ? `<span class="tree-meta-size">${formatFileSize(item.size)}</span>` : '';
            html += `<div class="tree-node tree-node-file" data-path="${safePath}" style="padding-left: ${indent}px">
                <span class="tree-toggle"></span>
                <span class="tree-icon">📄</span>
                <span class="tree-name file">${escapeHtml(item.name)}</span>
                <span class="tree-meta">${sizeHtml}${mtimeHtml}</span>
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
            <input type="text" id="prop-target-input" class="auth-form-input" placeholder="${t('props.pathPlaceholder')}" value="${escapeHtml(state.propertiesTarget)}">
            <button class="btn-primary btn-small" onclick="changePropTarget()">${t('btn.load')}</button>
        </div>
    </div>`;

    // Add property form
    html += `<div class="section-label">${t('props.addProperty')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="prop-new-name" class="auth-form-input" placeholder="${t('props.namePlaceholder')}">
            <input type="text" id="prop-new-value" class="auth-form-input" style="flex:2" placeholder="${t('props.valuePlaceholder')}">
            <button class="btn-primary btn-small" onclick="addProperty()">${t('props.set')}</button>
        </div>
    </div>`;

    // Properties list
    html += `<div class="section-label">${t('props.propertiesOn', { target: escapeHtml(state.propertiesTarget), count: state.properties.length })}</div>`;

    if (state.properties.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('props.noProperties')}</p></div>`;
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
                                <button class="btn-primary btn-small" onclick="updateProperty('${escapeHtml(prop.name)}')">${t('btn.save')}</button>
                                <button class="btn-secondary btn-small" onclick="cancelEditProp()">${t('btn.cancel')}</button>
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
                            <button class="btn-secondary btn-small" onclick="editProp('${escapeHtml(prop.name)}')">${t('btn.edit')}</button>
                            <button class="btn-secondary btn-small" style="color: var(--error);" onclick="deleteProperty('${escapeHtml(prop.name)}')">${t('btn.delete')}</button>
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
            await Promise.all([fetchBranchList(), fetchTagList()]);
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

// Derive the project-layout base URL (parent of trunk/branches/tags).
// For a sub-project layout like `repo/myproj/trunk`, returns `repo/myproj`;
// for single-project repos it falls back to repoRootUrl.
function getLayoutBase() {
    const wcUrl = state.branchInfo && state.branchInfo.url;
    if (wcUrl) {
        const m = wcUrl.match(/^(.*?)\/(trunk|branches\/[^/]+|tags\/[^/]+)(\/.*)?$/);
        if (m) return m[1];
    }
    return state.repoRootUrl || '';
}

async function lsSvnPath(url) {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return null;
    try {
        const result = await window.api.runSvn(['ls', url], null, project.url);
        if (result && result.success) {
            return result.output.split('\n')
                .filter(l => l.trim())
                .map(l => l.replace(/\/$/, ''));
        }
    } catch { /* fall through */ }
    return null;
}

async function fetchBranchList() {
    const base = getLayoutBase();
    if (!base) { state.branchList = []; return; }
    // Try sub-project layout first, fall back to root layout.
    let list = await lsSvnPath(base + '/branches');
    if (list === null && base !== state.repoRootUrl) {
        list = await lsSvnPath(state.repoRootUrl + '/branches');
    }
    state.branchList = list || [];
}

async function fetchTagList() {
    const base = getLayoutBase();
    if (!base) { state.tagList = []; return; }
    let list = await lsSvnPath(base + '/tags');
    if (list === null && base !== state.repoRootUrl) {
        list = await lsSvnPath(state.repoRootUrl + '/tags');
    }
    state.tagList = list || [];
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
        html += `<div class="section-label">${t('branch.currentLocation')}</div>
        <div class="branch-info-card">
            <div class="branch-info-row"><span class="branch-label">${t('branch.url')}</span><span class="branch-value">${escapeHtml(info.url || '')}</span></div>
            <div class="branch-info-row"><span class="branch-label">${t('branch.relative')}</span><span class="branch-value">${escapeHtml(currentBranch)}</span></div>
            <div class="branch-info-row"><span class="branch-label">${t('branch.revision')}</span><span class="branch-value">r${escapeHtml(info.revision || '')}</span></div>
            <div class="branch-info-row"><span class="branch-label">${t('branch.lastAuthor')}</span><span class="branch-value">${escapeHtml(info.lastAuthor || '')}</span></div>
            <div class="branch-info-row"><span class="branch-label">${t('branch.lastChanged')}</span><span class="branch-value">${escapeHtml(info.lastDate || '')}</span></div>
        </div>`;
    }

    // Create branch/tag
    html += `<div class="section-label">${t('branch.createBranchTag')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <select id="branch-create-type" class="auth-form-input" style="flex:0 0 120px">
                <option value="branch">${t('branch.branch')}</option>
                <option value="tag">${t('branch.tag')}</option>
            </select>
            <input type="text" id="branch-create-name" class="auth-form-input" style="flex:2" placeholder="${t('branch.namePlaceholder')}">
            <input type="text" id="branch-create-message" class="auth-form-input" style="flex:2" placeholder="${t('branch.commitMessage')}">
            <button class="btn-primary btn-small" onclick="createBranchOrTag()">${t('btn.create')}</button>
        </div>
    </div>`;

    const layoutBase = getLayoutBase();

    // Branches list
    html += `<div class="section-label">${t('branch.branches', { count: state.branchList.length })}</div>`;
    if (state.branchList.length === 0) {
        html += `<div class="empty-state" style="padding: 32px 0;"><p>${t('branch.noBranches')}</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const branch of state.branchList) {
            const branchUrl = layoutBase + '/branches/' + branch;
            html += `
                <div class="status-card branch-card">
                    <div class="file-info">
                        <span class="file-badge badge-added">B</span>
                        <span class="file-path">${escapeHtml(branch)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-primary btn-small" onclick="switchToBranch('${escapeHtml(branchUrl)}')">${t('branch.switch')}</button>
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    // Tags list
    html += `<div class="section-label">${t('branch.tags', { count: state.tagList.length })}</div>`;
    if (state.tagList.length === 0) {
        html += `<div class="empty-state" style="padding: 32px 0;"><p>${t('branch.noTags')}</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const tag of state.tagList) {
            const tagUrl = layoutBase + '/tags/' + tag;
            html += `
                <div class="status-card branch-card">
                    <div class="file-info">
                        <span class="file-badge badge-modified">T</span>
                        <span class="file-path">${escapeHtml(tag)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-primary btn-small" onclick="switchToBranch('${escapeHtml(tagUrl)}')">${t('branch.switch')}</button>
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
    const destUrl = getLayoutBase() + '/' + destPath + '/' + name;
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
        // `svn status -u` path column width is not fixed — the revision column
        // varies with digit count. Skip the first 9 status flag columns, then
        // peel off the optional out-of-date marker and numeric working-rev
        // before taking the rest as the path.
        const rest = line.substring(9);
        const m = rest.match(/^\s*\*?\s*\d*\s*(.*)$/);
        const filePath = (m ? m[1] : rest).trim();

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

    html += `<div class="section-label">${t('lock.lockFile')}</div>
    <div class="auth-form">
        <div class="auth-form-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="text" id="lock-file-path" class="auth-form-input" style="flex:2; min-width: 200px;" placeholder="${t('lock.filePathPlaceholder')}">
            <input type="text" id="lock-message" class="auth-form-input" style="flex:2; min-width: 200px;" placeholder="${t('lock.messagePlaceholder')}">
            <button class="btn-primary btn-small" onclick="lockFileFromInput()">${t('lock.lock')}</button>
        </div>
    </div>`;

    html += `<div class="section-label">${t('lock.lockedFiles', { count: state.lockFiles.length })}</div>`;

    if (state.lockFiles.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('lock.noLockedFiles')}</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const file of state.lockFiles) {
            const ep = escapePath(file.path);
            const badgeClass = file.lockStatus === 'locked-mine' ? 'badge-lock-mine' :
                               file.lockStatus === 'locked-other' ? 'badge-lock-other' :
                               file.lockStatus === 'stolen' ? 'badge-lock-stolen' : 'badge-lock-broken';
            const badgeLabel = file.lockStatus === 'locked-mine' ? t('lock.mine') :
                               file.lockStatus === 'locked-other' ? t('lock.other') :
                               file.lockStatus === 'stolen' ? t('lock.stolen') : t('lock.broken');

            html += `
                <div class="status-card lock-card" onclick="fetchLockInfo('${ep}')">
                    <div class="file-info">
                        <span class="file-badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
                        <span class="file-path">${escapeHtml(file.path)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" onclick="fetchLockInfo('${ep}')">${t('lock.info')}</button>
                        ${file.lockStatus === 'locked-mine' ?
                            `<button class="btn-secondary btn-small" onclick="unlockFile('${ep}', false)">${t('lock.unlock')}</button>` :
                            `<button class="btn-secondary btn-small" style="color: var(--warning);" onclick="unlockFile('${ep}', true)">${t('lock.forceUnlock')}</button>`
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

    html += `<div class="section-label">${t('blame.selectFile')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="blame-file-path" class="auth-form-input" style="flex:3" placeholder="${t('blame.filePathPlaceholder')}" value="${escapeHtml(state.blameFile)}">
            <button class="btn-primary btn-small" onclick="loadBlameFromInput()">${t('btn.load')}</button>
        </div>
    </div>`;

    if (state.blameData.length === 0 && !state.blameFile) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('blame.enterFilePath')}</p></div>`;
    } else if (state.blameData.length === 0 && state.blameFile) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('blame.noData', { file: escapeHtml(state.blameFile) })}</p></div>`;
    } else {
        const authorColors = getAuthorColorMap(state.blameData);

        html += `<div class="section-label">${t('blame.blameFor', { file: escapeHtml(state.blameFile), count: state.blameData.length })}</div>`;
        html += '<div class="blame-table-wrapper"><table class="blame-table"><thead><tr>';
        html += `<th class="blame-col-line">${t('blame.line')}</th>`;
        html += `<th class="blame-col-rev">${t('blame.rev')}</th>`;
        html += `<th class="blame-col-author">${t('blame.author')}</th>`;
        html += `<th class="blame-col-code">${t('blame.code')}</th>`;
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
    html += `<div class="section-label">${t('settings.general')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.logLimit')}</span>
                <span class="settings-desc">${t('settings.logLimitDesc')}</span>
            </div>
            <input type="number" id="settings-log-limit" class="settings-input" value="${s.logLimit}" min="5" max="200" onchange="onSettingChange()">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.theme')}</span>
                <span class="settings-desc">${t('settings.themeDesc')}</span>
            </div>
            <select id="settings-theme" class="settings-input" onchange="onSettingChange()">
                <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>${t('settings.themeDark')}</option>
                <option value="midnight" ${s.theme === 'midnight' ? 'selected' : ''}>${t('settings.themeMidnight')}</option>
                <option value="forest" ${s.theme === 'forest' ? 'selected' : ''}>${t('settings.themeForest')}</option>
            </select>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.language')}</span>
                <span class="settings-desc">${t('settings.languageDesc')}</span>
            </div>
            <select id="settings-language" class="settings-input" onchange="onLanguageChange()">
                <option value="en" ${getCurrentLanguage() === 'en' ? 'selected' : ''}>English</option>
                <option value="ko" ${getCurrentLanguage() === 'ko' ? 'selected' : ''}>한국어</option>
                <option value="zh-CN" ${getCurrentLanguage() === 'zh-CN' ? 'selected' : ''}>简体中文</option>
            </select>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.extDiffTool')}</span>
                <span class="settings-desc">${t('settings.extDiffToolDesc')}</span>
            </div>
            <select id="settings-ext-diff" class="settings-input" onchange="onSettingChange()">
                <option value="builtin" ${(s.externalDiffTool || 'builtin') === 'builtin' ? 'selected' : ''}>${t('settings.builtinViewer')}</option>
                <option value="opendiff" ${s.externalDiffTool === 'opendiff' ? 'selected' : ''}>FileMerge (opendiff)</option>
                <option value="vscode" ${s.externalDiffTool === 'vscode' ? 'selected' : ''}>VS Code</option>
                <option value="bbedit" ${s.externalDiffTool === 'bbedit' ? 'selected' : ''}>BBEdit</option>
                <option value="kdiff3" ${s.externalDiffTool === 'kdiff3' ? 'selected' : ''}>KDiff3</option>
            </select>
        </div>
    </div>`;

    // Auto-refresh
    html += `<div class="section-label">${t('settings.autoRefresh')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.enableAutoRefresh')}</span>
                <span class="settings-desc">${t('settings.enableAutoRefreshDesc')}</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="settings-auto-refresh" ${s.autoRefresh ? 'checked' : ''} onchange="onAutoRefreshToggle()">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.debounceInterval')}</span>
                <span class="settings-desc">${t('settings.debounceIntervalDesc')}</span>
            </div>
            <input type="number" id="settings-auto-interval" class="settings-input" value="${s.autoRefreshInterval}" min="1000" max="30000" step="1000" onchange="onSettingChange()">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.watcherStatus')}</span>
                <span class="settings-desc">${state.watcherActive ? t('settings.watcherActive') : t('settings.watcherInactive')}</span>
            </div>
            <span class="settings-status-badge ${state.watcherActive ? 'active' : ''}">${state.watcherActive ? t('settings.watcherActive') : t('settings.watcherInactive')}</span>
        </div>
    </div>`;

    // Placeholder
    html += `<div class="section-label">${t('placeholder.enabled')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('placeholder.enabled')}</span>
                <span class="settings-desc">${t('placeholder.enabledDesc')}</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="settings-placeholder-enabled" ${state.placeholderEnabled ? 'checked' : ''} onchange="onPlaceholderToggle()">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('placeholder.remoteUrl')}</span>
                <span class="settings-desc">${t('placeholder.remoteUrlDesc')}</span>
            </div>
            <input type="text" id="settings-placeholder-url" class="settings-input" style="width: 320px;" placeholder="https://svn.example.com/repo/trunk" value="${escapeHtml(state.settings.placeholderRemoteUrl || '')}" onchange="onPlaceholderUrlChange()">
        </div>
    </div>`;

    // Keyboard shortcuts
    html += `<div class="section-label">${t('settings.shortcuts')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('settings.showShortcuts')}</span>
                <span class="settings-desc">${t('settings.showShortcutsDesc')}</span>
            </div>
            <button class="btn-secondary btn-small" onclick="openShortcutsModal()">${t('btn.viewShortcuts')}</button>
        </div>
    </div>`;

    // About
    html += `<div class="section-label">${t('settings.about')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">JellySvn</span>
                <span class="settings-desc">${t('settings.aboutDesc')}</span>
            </div>
            <span class="settings-version">v1.1.0</span>
        </div>
    </div>`;

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function onLanguageChange() {
    const langSelect = document.getElementById('settings-language');
    if (langSelect) {
        setLanguage(langSelect.value);
    }
}

function onSettingChange() {
    // Clamp to the HTML input bounds so devtools / paste / direct state
    // writes can't push svn log -l into absurd values or poll the file
    // watcher 10x/second.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const rawLogLimit = parseInt(document.getElementById('settings-log-limit').value, 10);
    const logLimit = clamp(isNaN(rawLogLimit) ? 20 : rawLogLimit, 5, 200);
    const theme = document.getElementById('settings-theme').value;
    const rawInterval = parseInt(document.getElementById('settings-auto-interval').value, 10);
    const interval = clamp(isNaN(rawInterval) ? 5000 : rawInterval, 1000, 30000);
    const extDiff = document.getElementById('settings-ext-diff');

    state.settings.logLimit = logLimit;
    state.settings.theme = theme;
    state.settings.autoRefreshInterval = interval;
    state.settings.externalDiffTool = extDiff ? extDiff.value : 'builtin';
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

function onPlaceholderToggle() {
    const checkbox = document.getElementById('settings-placeholder-enabled');
    state.placeholderEnabled = checkbox.checked;
    state.settings.placeholderEnabled = checkbox.checked;
    saveSettings();
    if (state.placeholderEnabled && state.selectedProjectIndex >= 0) {
        runPlaceholderScan();
    } else {
        state.placeholderStats = null;
    }
    render();
}

function onPlaceholderUrlChange() {
    const input = document.getElementById('settings-placeholder-url');
    state.settings.placeholderRemoteUrl = input ? input.value.trim() : '';
    saveSettings();
}

async function runPlaceholderScan() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;
    const result = await window.api.placeholderScan(project.path);
    if (result.success) {
        state.placeholderStats = result;
    }
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
            <input type="text" id="search-query-input" class="search-input" placeholder="${t('search.placeholder')}" value="${escapeHtml(state.searchQuery)}" onkeydown="if(event.key==='Enter'){executeSearch();}">
            <div class="search-type-toggle">
                <button class="${state.searchType === 'filename' ? 'active' : ''}" onclick="setSearchType('filename')">${t('search.filename')}</button>
                <button class="${state.searchType === 'content' ? 'active' : ''}" onclick="setSearchType('content')">${t('search.content')}</button>
            </div>
            <button class="btn-primary" onclick="executeSearch()" ${state.searchLoading ? 'disabled' : ''}>${t('btn.search')}</button>
        </div>
    </div>`;

    // Results area
    if (state.searchLoading) {
        html += `<div class="empty-state" style="padding: 64px 0;"><div class="loading-spinner"></div><p>${t('search.searching')}</p></div>`;
    } else if (state.searchQuery && state.searchResults.length > 0) {
        const truncatedNote = state.searchResultsTruncated ? ' ' + t('search.resultsLimited') : '';
        html += `<div class="search-results-header">${t('search.matchesFound', { count: state.searchResults.length })}${truncatedNote}</div>`;
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
        html += `<div class="empty-state" style="padding: 64px 0;"><p>${t('search.noMatches')}</p></div>`;
    } else {
        html += `<div class="empty-state" style="padding: 64px 0;"><p>${t('search.enterQuery')}</p></div>`;
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
    html += `<div class="section-label">${t('merge.source')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="merge-source-url" class="auth-form-input" style="flex:3" placeholder="${t('merge.sourceUrlPlaceholder')}" value="${escapeHtml(state.mergeSource)}">
        </div>`;

    // Branch suggestions
    const mergeLayoutBase = getLayoutBase();
    if (state.branchList.length > 0 && mergeLayoutBase) {
        html += `<div class="merge-suggestions">
            <span class="merge-suggestions-label">${t('merge.branches')}</span>`;
        for (const branch of state.branchList) {
            const branchUrl = mergeLayoutBase + '/branches/' + branch;
            html += `<button class="btn-secondary btn-small merge-suggestion-btn" onclick="document.getElementById('merge-source-url').value='${escapeHtml(branchUrl)}'">${escapeHtml(branch)}</button>`;
        }
        html += '</div>';
    }

    html += '</div>';

    // Revision range inputs
    html += `<div class="section-label">${t('merge.revisionRange')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="merge-rev-from" class="auth-form-input" placeholder="${t('merge.fromRevision')}" value="${escapeHtml(state.mergeRevFrom)}">
            <span class="merge-rev-separator">${t('merge.to')}</span>
            <input type="text" id="merge-rev-to" class="auth-form-input" placeholder="${t('merge.toRevision')}" value="${escapeHtml(state.mergeRevTo)}">
        </div>
    </div>`;

    // Options
    html += `<div class="section-label">${t('merge.options')}</div>
    <div class="auth-form">
        <div class="auth-form-row" style="align-items: center;">
            <label class="checkbox-container" style="margin-right: 12px;">
                <input type="checkbox" id="merge-reintegrate">
                <span class="checkmark"></span>
            </label>
            <span style="color: var(--text-secondary);">${t('merge.reintegrate')}</span>
        </div>
    </div>`;

    // Action buttons
    html += `<div class="merge-actions">
        <button class="btn-secondary" onclick="previewMerge()">${t('merge.preview')}</button>
        <button class="btn-primary" onclick="executeMerge()">${t('merge.execute')}</button>
    </div>`;

    // Preview results
    if (state.mergePreview.length > 0) {
        html += `<div class="section-label">${t('merge.previewResults', { count: state.mergePreview.length })}</div>`;
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
    html += `<div class="section-label">${t('export.export')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('export.source')}</span>
                <span class="settings-desc">${t('export.sourceDesc')}</span>
            </div>
            <div class="export-source-toggle">
                <label style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary); cursor: pointer;">
                    <input type="radio" name="export-source" value="wc" checked onchange="toggleExportSource()"> ${t('export.workingCopy')}
                </label>
                <label style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary); cursor: pointer;">
                    <input type="radio" name="export-source" value="url" onchange="toggleExportSource()"> ${t('export.repoUrl')}
                </label>
            </div>
        </div>
        <div class="settings-row" id="export-url-row" style="display: none;">
            <div class="settings-info">
                <span class="settings-title">${t('export.repoUrl')}</span>
                <span class="settings-desc">${t('export.repoUrlDesc')}</span>
            </div>
            <input type="text" id="export-url" class="auth-form-input" style="flex: 1; max-width: 400px;" placeholder="${t('export.repoUrlPlaceholder')}">
        </div>
        <div class="settings-row" id="export-rev-row" style="display: none;">
            <div class="settings-info">
                <span class="settings-title">${t('export.revision')}</span>
                <span class="settings-desc">${t('export.revisionDesc')}</span>
            </div>
            <input type="text" id="export-revision" class="auth-form-input" style="flex: 0 0 120px;" placeholder="HEAD">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('export.destination')}</span>
                <span class="settings-desc">${t('export.destinationDesc')}</span>
            </div>
            <div class="input-with-button" style="flex: 1; max-width: 400px;">
                <input type="text" id="export-dest" class="auth-form-input" placeholder="${t('export.destinationPlaceholder')}">
                <button class="btn-secondary btn-small" onclick="browseExportDest()">${t('btn.browse')}</button>
            </div>
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doExport()">${t('export.export')}</button>
        </div>
    </div>`;

    // === Import Section ===
    html += `<div class="section-label">${t('export.import')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('export.localPath')}</span>
                <span class="settings-desc">${t('export.localPathDesc')}</span>
            </div>
            <div class="input-with-button" style="flex: 1; max-width: 400px;">
                <input type="text" id="import-local-path" class="auth-form-input" placeholder="${t('export.localPathPlaceholder')}">
                <button class="btn-secondary btn-small" onclick="browseImportPath()">${t('btn.browse')}</button>
            </div>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('export.targetUrl')}</span>
                <span class="settings-desc">${t('export.targetUrlDesc')}</span>
            </div>
            <input type="text" id="import-target-url" class="auth-form-input" style="flex: 1; max-width: 400px;" placeholder="${t('export.targetUrlPlaceholder')}">
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('export.commitMessage')}</span>
                <span class="settings-desc">${t('export.commitMessageDesc')}</span>
            </div>
            <input type="text" id="import-message" class="auth-form-input" style="flex: 1; max-width: 400px;" placeholder="${t('export.commitMessagePlaceholder')}">
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doImport()">${t('export.import')}</button>
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
    html += `<div class="section-label">${t('tools.cleanup')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.cleanupWC')}</span>
                <span class="settings-desc">${t('tools.cleanupWCDesc')}</span>
            </div>
            <button class="btn-primary" onclick="doCleanup()">${t('tools.runCleanup')}</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.cleanupVacuum')}</span>
                <span class="settings-desc">${t('tools.cleanupVacuumDesc')}</span>
            </div>
            <button class="btn-secondary" onclick="doCleanup(true)">${t('tools.runCleanupVacuum')}</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.removeUnversioned')}</span>
                <span class="settings-desc">${t('tools.removeUnversionedDesc')}</span>
            </div>
            <button class="btn-secondary" style="color: var(--error);" onclick="doCleanupRemoveUnversioned()">${t('tools.runRemoveUnversioned')}</button>
        </div>
    </div>`;

    // === Update to Revision Section ===
    html += `<div class="section-label">${t('tools.updateToRevision')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.updateToRevisionTitle')}</span>
                <span class="settings-desc">${t('tools.updateToRevisionDesc')}</span>
            </div>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="number" id="update-to-revision" class="auth-form-input" style="flex: 1; min-width: 120px;" placeholder="${t('tools.revisionPlaceholder')}" min="1">
            <button class="btn-primary" onclick="doUpdateToRevision()">${t('tools.updateToRev')}</button>
            <button class="btn-secondary" onclick="doUpdateToRevision(true)">${t('tools.updateHead')}</button>
        </div>
    </div>`;

    // === Working Copy Upgrade Section ===
    html += `<div class="section-label">${t('tools.wcUpgrade')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.wcUpgradeTitle')}</span>
                <span class="settings-desc">${t('tools.wcUpgradeDesc')}</span>
            </div>
            <button class="btn-primary" onclick="doUpgradeWC()">${t('tools.upgrade')}</button>
        </div>
    </div>`;

    // === Relocate Section ===
    html += `<div class="section-label">${t('tools.relocate')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.currentRepoUrl')}</span>
                <span class="settings-desc">${escapeHtml(project.url || t('tools.unknownUrl'))}</span>
            </div>
            <button class="btn-secondary btn-small" onclick="detectRepoUrl()">${t('tools.detect')}</button>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">${t('tools.fromUrl')}</span>
                <span class="settings-desc">${t('tools.fromUrlDesc')}</span>
            </div>
            <input type="text" id="relocate-from-url" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="${t('tools.fromUrlPlaceholder')}" value="${escapeHtml(project.url || '')}">
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">${t('tools.toUrl')}</span>
                <span class="settings-desc">${t('tools.toUrlDesc')}</span>
            </div>
            <input type="text" id="relocate-to-url" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="${t('tools.toUrlPlaceholder')}">
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doRelocate()">${t('tools.runRelocate')}</button>
        </div>
    </div>`;

    // === Copy / Move / Rename Section ===
    html += `<div class="section-label">${t('tools.copyMoveRename')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.operation')}</span>
                <span class="settings-desc">${t('tools.operationDesc')}</span>
            </div>
            <select id="copymove-operation" class="settings-input" onchange="onCopyMoveOpChange()">
                <option value="copy">${t('tools.copy')}</option>
                <option value="move">${t('tools.move')}</option>
            </select>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">${t('tools.sourcePath')}</span>
                <span class="settings-desc">${t('tools.sourcePathDesc')}</span>
            </div>
            <input type="text" id="copymove-source" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="${t('tools.sourcePathPlaceholder')}">
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <div class="settings-info">
                <span class="settings-title">${t('tools.destPath')}</span>
                <span class="settings-desc">${t('tools.destPathDesc')}</span>
            </div>
            <input type="text" id="copymove-dest" class="auth-form-input" style="flex: 1; min-width: 200px;" placeholder="${t('tools.destPathPlaceholder')}">
        </div>
        <div class="settings-row" style="justify-content: flex-end;">
            <button class="btn-primary" onclick="doCopyMove()">${t('tools.execute')}</button>
        </div>
    </div>`;

    // === Changelist Section ===
    html += `<div class="section-label">${t('tools.changelists')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('tools.addToChangelist')}</span>
                <span class="settings-desc">${t('tools.addToChangelistDesc')}</span>
            </div>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="text" id="changelist-name" class="auth-form-input" style="flex: 1; min-width: 150px;" placeholder="${t('tools.changelistPlaceholder')}">
            <input type="text" id="changelist-file" class="auth-form-input" style="flex: 2; min-width: 200px;" placeholder="${t('tools.filePathPlaceholder')}">
            <button class="btn-primary btn-small" onclick="addToChangelist()">${t('btn.add')}</button>
            <button class="btn-secondary btn-small" onclick="removeFromChangelist()">${t('btn.remove')}</button>
        </div>
    </div>`;

    // Show current changelists
    if (Object.keys(state.changelists).length > 0) {
        for (const [clName, files] of Object.entries(state.changelists)) {
            html += `<div class="section-label">${t('tools.changelist', { name: escapeHtml(clName), count: files.length })}</div>`;
            html += '<div class="status-list">';
            for (const file of files) {
                html += `<div class="status-card">
                    <div class="file-info">
                        <span class="file-badge badge-modified">CL</span>
                        <span class="file-path">${escapeHtml(file)}</span>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" style="color: var(--error);" onclick="removeFileFromChangelist('${escapeHtml(clName)}', '${escapePath(file)}')">${t('btn.remove')}</button>
                    </div>
                </div>`;
            }
            html += '</div>';
            html += `<div style="padding: 8px 0;">
                <button class="btn-primary btn-small" onclick="commitChangelist('${escapeHtml(clName)}')">${t('tools.commitChangelist')}</button>
            </div>`;
        }
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;

    // Load changelists
    fetchChangelists();
}

// --- Update to Revision ---
async function doUpdateToRevision(toHead = false) {
    if (toHead) {
        const success = await runSvn(['update']);
        if (success) {
            logToConsole('Updated to HEAD.', 'success');
        }
        return;
    }

    const revInput = document.getElementById('update-to-revision');
    const rev = revInput ? revInput.value.trim() : '';
    if (!rev) return alert('Please enter a revision number.');

    if (!confirm(`Update working copy to revision r${rev}?`)) return;
    const success = await runSvn(['update', '-r', rev]);
    if (success) {
        logToConsole(`Updated to revision r${rev}.`, 'success');
    }
}

// --- Working Copy Upgrade ---
async function doUpgradeWC() {
    if (!confirm('Upgrade the working copy format to the latest version?\nThis operation cannot be undone.')) return;
    const success = await runSvn(['upgrade']);
    if (success) {
        logToConsole('Working copy upgraded successfully.', 'success');
    }
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
        // Caller (renderToolsView) invokes us fire-and-forget after an
        // innerHTML write, so we must re-render once data arrives or the
        // new changelist rows never appear.
        if (state.currentView === 'tools') render();
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
    html += `<div class="section-label">${t('patch.createPatch')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('patch.createPatch')}</span>
                <span class="settings-desc">${t('patch.createPatchDesc')}</span>
            </div>
            <button class="btn-primary" onclick="createPatch()">${t('patch.create')}</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('patch.selectFile')}</span>
                <span class="settings-desc">${t('patch.createPatchDesc')}</span>
            </div>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="text" id="patch-files" class="auth-form-input" style="flex: 2; min-width: 200px;" placeholder="file1.js, src/file2.py">
            <button class="btn-secondary" onclick="createPatchForFiles()">${t('patch.create')}</button>
        </div>
    </div>`;

    // === Patch Apply Section ===
    html += `<div class="section-label">${t('patch.applyPatch')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('patch.applyPatch')}</span>
                <span class="settings-desc">${t('patch.applyPatchDesc')}</span>
            </div>
            <button class="btn-primary" onclick="applyPatch()">${t('patch.apply')}</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('patch.dryRun')}</span>
                <span class="settings-desc">${t('patch.applyPatchDesc')}</span>
            </div>
            <button class="btn-secondary" onclick="applyPatch(true)">${t('patch.dryRun')}</button>
        </div>
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('patch.reverse')}</span>
                <span class="settings-desc">${t('patch.applyPatchDesc')}</span>
            </div>
            <button class="btn-secondary" onclick="applyPatch(false, true)">${t('patch.reverse')}</button>
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

// === Log Revision Compare & Revert ===
function toggleLogRevisionSelect(rev) {
    if (state.logSelectedRevisions.has(rev)) {
        state.logSelectedRevisions.delete(rev);
    } else {
        if (state.logSelectedRevisions.size >= 2) {
            state.logSelectedRevisions.clear();
        }
        state.logSelectedRevisions.add(rev);
    }
    render();
}

async function compareSelectedRevisions() {
    if (state.logSelectedRevisions.size !== 2) {
        logToConsole('Please select exactly 2 revisions to compare.', 'error');
        return;
    }

    const revArr = Array.from(state.logSelectedRevisions).sort((a, b) => parseInt(a) - parseInt(b));
    const rev1 = revArr[0];
    const rev2 = revArr[1];

    elements.diffModalTitle.textContent = `Diff: r${rev1} vs r${rev2}`;
    elements.diffContent.innerHTML = '<div class="diff-empty"><div class="loading-spinner"></div></div>';
    elements.diffModal.classList.remove('hidden');

    const result = await runSvnSilent(['diff', '-r', `${rev1}:${rev2}`]);
    if (result && result.output && result.output.trim()) {
        lastDiffRawOutput = result.output;
        renderDiffContent();
    } else {
        elements.diffContent.innerHTML = '<div class="diff-empty">No differences found between the two revisions.</div>';
    }
}

async function revertToRevision(rev) {
    if (!confirm(`Revert working copy to revision r${rev}?\nThis will merge changes from HEAD back to r${rev}.`)) return;
    const success = await runSvn(['merge', '-r', `HEAD:${rev}`, '.']);
    if (success) {
        logToConsole(`Reverted working copy to r${rev}. Review changes and commit.`, 'success');
    }
}

async function revertRevisionChange(rev) {
    if (!confirm(`Undo changes from revision r${rev}?\nThis will reverse-merge that specific revision.`)) return;
    const success = await runSvn(['merge', '-c', `-${rev}`, '.']);
    if (success) {
        logToConsole(`Reverted changes from r${rev}. Review changes and commit.`, 'success');
    }
}

// === Remote URL Log ===
async function fetchRemoteLog() {
    const urlInput = document.getElementById('remote-log-url');
    const url = urlInput ? urlInput.value.trim() : '';
    if (!url) return alert('Please enter a remote SVN URL.');

    if (state.currentOperation) await waitForOperation();

    state.isScanning = true;
    render();

    const limit = state.logPage * state.logLimit;
    const cwd = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].path : null;
    const projectUrl = state.selectedProjectIndex >= 0 ? state.projects[state.selectedProjectIndex].url : null;

    showOperation('Fetching remote log...');
    try {
        const result = await window.api.runSvn(['log', '-l', String(limit), '-v', url], cwd, projectUrl);
        hideOperation();
        state.isScanning = false;
        if (result && result.success) {
            parseLogEntries(result.output || '');
            logToConsole(`Fetched remote log from: ${url}`, 'success');
        } else {
            state.logEntries = [];
            logToConsole(`Failed to fetch remote log: ${result ? result.error : 'Unknown error'}`, 'error');
        }
    } catch (err) {
        hideOperation();
        state.isScanning = false;
        state.logEntries = [];
        logToConsole(`Failed: ${err.message}`, 'error');
    }
    render();
}

// === Commit Filter ===
let _commitFilterTimer = null;

function onCommitFilterChange() {
    clearTimeout(_commitFilterTimer);
    _commitFilterTimer = setTimeout(() => {
        const input = document.getElementById('commit-filter-input');
        state.commitFilter = input ? input.value.trim() : '';
        render();
    }, 200);
}

function clearCommitFilter() {
    clearTimeout(_commitFilterTimer);
    state.commitFilter = '';
    render();
}

// =============================================
// === Repository Browser ===
// =============================================
// === Repository Browser (tree view, lazy + recursive modes) ===

function normalizeRepoUrl(url) {
    return (url || '').trim().replace(/\/+$/, '');
}

function joinRepoUrl(parent, name) {
    return normalizeRepoUrl(parent) + '/' + name;
}

// Parse `svn list --verbose` output.
// Columns: revision  author  [size]  month day time  name
// Directory rows omit the size column — detect by presence of trailing '/'.
function parseSvnListVerbose(output) {
    const entries = [];
    for (const raw of output.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const rev = parts[0];
        const author = parts[1];
        let size = null;
        let dateStart = 2;
        if (/^\d+$/.test(parts[2])) {
            size = parseInt(parts[2], 10);
            dateStart = 3;
        }
        const date = parts.slice(dateStart, dateStart + 3).join(' ');
        const fullName = parts.slice(dateStart + 3).join(' ');
        if (!fullName || fullName === './' || fullName === '.') continue;
        const isDir = fullName.endsWith('/');
        const name = isDir ? fullName.slice(0, -1) : fullName;
        entries.push({
            name,
            type: isDir ? 'dir' : 'file',
            revision: rev,
            author,
            size,
            date,
        });
    }
    entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return entries;
}

async function fetchRepoFolder(url) {
    const key = normalizeRepoUrl(url);
    state.repoBrowserLoading.add(key);
    render();
    const result = await runSvnSilent(['list', '--verbose', key]);
    state.repoBrowserLoading.delete(key);
    if (!result || !result.output) {
        state.repoBrowserTree[key] = [];
        logToConsole(`Failed to browse: ${key}`, 'error');
        render();
        return false;
    }
    state.repoBrowserTree[key] = parseSvnListVerbose(result.output);
    render();
    return true;
}

async function fetchRepoRecursive(rootUrl) {
    const key = normalizeRepoUrl(rootUrl);
    state.repoBrowserLoading.add(key);
    render();
    const result = await runSvnSilent(['list', '-R', '--verbose', key]);
    state.repoBrowserLoading.delete(key);
    if (!result || !result.output) {
        logToConsole(`Recursive list failed: ${key}`, 'error');
        render();
        return;
    }
    // Each row's name is a path relative to the root. Bucket entries by
    // their parent URL so the tree renderer can walk them the same way
    // as single-folder results.
    const buckets = {};
    buckets[key] = [];
    state.repoBrowserExpanded.add(key);
    for (const raw of result.output.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const rev = parts[0];
        const author = parts[1];
        let size = null;
        let dateStart = 2;
        if (/^\d+$/.test(parts[2])) {
            size = parseInt(parts[2], 10);
            dateStart = 3;
        }
        const date = parts.slice(dateStart, dateStart + 3).join(' ');
        const relPath = parts.slice(dateStart + 3).join(' ');
        if (!relPath || relPath === './' || relPath === '.') continue;
        const isDir = relPath.endsWith('/');
        const cleanRel = isDir ? relPath.slice(0, -1) : relPath;
        const segments = cleanRel.split('/');
        const name = segments[segments.length - 1];
        const parentRel = segments.slice(0, -1).join('/');
        const parentUrl = parentRel ? key + '/' + parentRel : key;
        if (!buckets[parentUrl]) buckets[parentUrl] = [];
        buckets[parentUrl].push({
            name,
            type: isDir ? 'dir' : 'file',
            revision: rev,
            author,
            size,
            date,
        });
        if (isDir) {
            const dirUrl = key + '/' + cleanRel;
            if (!buckets[dirUrl]) buckets[dirUrl] = [];
            state.repoBrowserExpanded.add(dirUrl);
        }
    }
    for (const [u, arr] of Object.entries(buckets)) {
        arr.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        state.repoBrowserTree[u] = arr;
    }
    const total = Object.values(buckets).reduce((s, a) => s + a.length, 0);
    logToConsole(`Loaded recursive tree: ${total} entries from ${key}`, 'success');
    render();
}

async function browseRepoFromInput() {
    const urlInput = document.getElementById('repo-browser-url');
    const url = normalizeRepoUrl(urlInput ? urlInput.value : '');
    if (!url) return alert('Please enter a repository URL.');
    state.repoBrowserRoot = url;
    state.repoBrowserTree = {};
    state.repoBrowserExpanded = new Set([url]);
    state.repoBrowserLoading = new Set();
    logToConsole(`Browsing: ${url}`, 'system');
    await fetchRepoFolder(url);
}

async function browseRepoRecursive() {
    const urlInput = document.getElementById('repo-browser-url');
    const url = normalizeRepoUrl(urlInput ? urlInput.value : state.repoBrowserRoot);
    if (!url) return alert('Please enter a repository URL.');
    state.repoBrowserRoot = url;
    state.repoBrowserTree = {};
    state.repoBrowserExpanded = new Set([url]);
    state.repoBrowserLoading = new Set();
    logToConsole(`Loading full tree: ${url}`, 'system');
    await fetchRepoRecursive(url);
}

async function toggleRepoFolder(url) {
    const key = normalizeRepoUrl(url);
    if (state.repoBrowserExpanded.has(key)) {
        state.repoBrowserExpanded.delete(key);
        render();
        return;
    }
    state.repoBrowserExpanded.add(key);
    if (!state.repoBrowserTree[key]) {
        await fetchRepoFolder(key);
    } else {
        render();
    }
}

function renderRepoBrowser() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="repo-browser-container">';

    // URL input + action buttons
    const inputValue = state.repoBrowserRoot || project.url || '';
    html += `<div class="section-label">${t('repo.repoUrl')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="repo-browser-url" class="auth-form-input" style="flex:3" placeholder="${t('repo.urlPlaceholder')}" value="${escapeHtml(inputValue)}">
            <button class="btn-primary btn-small" onclick="browseRepoFromInput()">${t('btn.browse')}</button>
            <button class="btn-secondary btn-small" onclick="browseRepoRecursive()">${t('repo.loadFullTree')}</button>
        </div>
    </div>`;

    if (state.repoBrowserRoot) {
        const total = Object.values(state.repoBrowserTree).reduce((s, arr) => s + (arr ? arr.length : 0), 0);
        html += `<div class="repo-tree-header">
            <span class="repo-tree-url" title="${escapeHtml(state.repoBrowserRoot)}">${escapeHtml(state.repoBrowserRoot)}</span>
            <span class="repo-tree-total">${t('repo.contents', { count: total })}</span>
        </div>`;
        html += '<div class="repo-tree-container">';
        html += renderRepoTreeNode(state.repoBrowserRoot, 0, true);
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function renderRepoTreeNode(url, depth, isRoot) {
    const key = normalizeRepoUrl(url);
    const isExpanded = state.repoBrowserExpanded.has(key);
    const isLoading = state.repoBrowserLoading.has(key);
    const children = state.repoBrowserTree[key];
    const safeKey = escapePath(key);
    const indent = depth * 20;

    let html = '';
    if (isRoot) {
        const rootName = key.split('/').pop() || key;
        html += `<div class="tree-node tree-node-root" onclick="toggleRepoFolder('${safeKey}')">
            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">&#9654;</span>
            <span class="tree-icon">🌐</span>
            <span class="tree-name">${escapeHtml(rootName)}/</span>
            <span class="tree-meta">
                ${isLoading ? '<span class="tree-meta-loading">loading…</span>' : ''}
            </span>
            <div class="tree-actions">
                <button class="btn-secondary btn-small" onclick="repoBrowserCopyTo('${safeKey}', event)">${t('repo.copyTo')}</button>
            </div>
        </div>`;
    }

    if (!isExpanded) return html;

    if (isLoading && !children) {
        html += `<div class="tree-node tree-node-loading" style="padding-left: ${indent + 24}px">
            <span class="tree-toggle"></span>
            <span class="tree-icon">⏳</span>
            <span class="tree-name">Loading…</span>
        </div>`;
        return html;
    }

    if (!children || children.length === 0) {
        html += `<div class="tree-node tree-node-empty" style="padding-left: ${indent + 24}px">
            <span class="tree-toggle"></span>
            <span class="tree-icon">∅</span>
            <span class="tree-name">${t('repo.emptyDir')}</span>
        </div>`;
        return html;
    }

    for (const entry of children) {
        const childUrl = joinRepoUrl(key, entry.name);
        const safeChild = escapePath(childUrl);
        const sizeHtml = entry.size != null ? `<span class="tree-meta-size">${formatFileSize(entry.size)}</span>` : '';
        const revHtml = `<span class="tree-meta-rev">r${escapeHtml(String(entry.revision))}</span>`;
        const authorHtml = `<span class="tree-meta-author">${escapeHtml(entry.author)}</span>`;
        const dateHtml = `<span class="tree-meta-date">${escapeHtml(entry.date)}</span>`;

        if (entry.type === 'dir') {
            const childExpanded = state.repoBrowserExpanded.has(normalizeRepoUrl(childUrl));
            html += `<div class="tree-node" style="padding-left: ${indent + 20}px" onclick="toggleRepoFolder('${safeChild}')">
                <span class="tree-toggle ${childExpanded ? 'expanded' : ''}">&#9654;</span>
                <span class="tree-icon">${childExpanded ? '📂' : '📁'}</span>
                <span class="tree-name" title="${escapeHtml(childUrl)}">${escapeHtml(entry.name)}/</span>
                <span class="tree-meta">${revHtml}${authorHtml}${dateHtml}</span>
                <div class="tree-actions">
                    <button class="btn-secondary btn-small" onclick="repoBrowserCopyTo('${safeChild}', event)">${t('repo.copyTo')}</button>
                </div>
            </div>`;
            html += renderRepoTreeNode(childUrl, depth + 1, false);
        } else {
            html += `<div class="tree-node tree-node-file" style="padding-left: ${indent + 20}px">
                <span class="tree-toggle"></span>
                <span class="tree-icon">📄</span>
                <span class="tree-name file" title="${escapeHtml(childUrl)}">${escapeHtml(entry.name)}</span>
                <span class="tree-meta">${revHtml}${authorHtml}${sizeHtml}${dateHtml}</span>
                <div class="tree-actions">
                    <button class="btn-secondary btn-small" onclick="repoBrowserCopyTo('${safeChild}', event)">${t('repo.copyTo')}</button>
                </div>
            </div>`;
        }
    }

    return html;
}

async function repoBrowserCopyTo(sourceUrl, event) {
    if (event) event.stopPropagation();
    const dest = prompt('Enter destination URL for svn copy:', '');
    if (!dest || !dest.trim()) return;

    const msg = prompt('Enter commit message:', `Copy from ${sourceUrl}`);
    if (msg === null) return;

    const commitMsg = msg.trim() || `Copy from ${sourceUrl}`;
    const success = await runSvn(['copy', sourceUrl, dest.trim(), '-m', commitMsg]);
    if (success) {
        logToConsole(`Copied ${sourceUrl} to ${dest.trim()}`, 'success');
    }
}

// =============================================
// === Shelve / Unshelve ===
// =============================================
function renderShelveView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = '<div class="empty-state"><p>No project selected.</p></div>';
        return;
    }

    let html = '<div class="shelve-container">';

    // Info
    html += `<div class="section-label">${t('shelve.shelveChanges')}</div>
    <div class="settings-card">
        <div class="settings-row">
            <div class="settings-info">
                <span class="settings-title">${t('shelve.shelveAll')}</span>
                <span class="settings-desc">${t('shelve.shelveAllDesc')}</span>
            </div>
        </div>
        <div class="settings-row" style="flex-wrap: wrap; gap: 10px;">
            <input type="text" id="shelve-name-input" class="auth-form-input" style="flex: 2; min-width: 200px;" placeholder="${t('shelve.namePlaceholder')}">
            <button class="btn-primary" onclick="doShelve()">${t('shelve.shelveButton')}</button>
        </div>
    </div>`;

    // Existing shelves
    html += `<div class="section-label">${t('shelve.existingShelves', { count: state.shelveList.length })}</div>`;
    if (state.shelveList.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('shelve.noShelves')}</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (const shelf of state.shelveList) {
            const ep = escapePath(shelf.name);
            html += `<div class="status-card" style="padding: 14px 16px;">
                <div class="file-info">
                    <span style="margin-right: 8px; font-size: 16px;">📌</span>
                    <div>
                        <span class="file-path" style="font-weight: 600;">${escapeHtml(shelf.name)}</span>
                        <div style="font-size: 12px; color: var(--text-dim); margin-top: 2px;">
                            ${shelf.type === 'native' ? t('shelve.nativeShelf') : t('shelve.patchShelf')}
                            ${shelf.date ? ` — ${new Date(shelf.date).toLocaleString()}` : ''}
                            ${shelf.fileCount ? ` — ${shelf.fileCount} file(s)` : ''}
                        </div>
                    </div>
                </div>
                <div class="file-actions" style="display: flex; gap: 8px;">
                    <button class="btn-primary btn-small" onclick="doUnshelve('${ep}')">${t('shelve.unshelve')}</button>
                    <button class="btn-secondary btn-small" style="color: var(--error);" onclick="if(confirm('Delete shelf \\'${ep}\\' permanently?')) deleteShelve('${ep}')">${t('btn.delete')}</button>
                </div>
            </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

async function fetchShelveList() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        state.shelveList = [];
        render();
        return;
    }

    // Try native SVN shelves command first
    const cwd = project.path;
    const url = project.url;

    if (state.currentOperation) await waitForOperation();
    showOperation('Loading shelves...');

    try {
        const result = await window.api.runSvn(['shelves'], cwd, url);
        hideOperation();

        if (result && result.success && result.output && result.output.trim()) {
            const shelves = [];
            const lines = result.output.trim().split('\n').filter(l => l.trim());
            for (const line of lines) {
                const name = line.trim().replace(/\s*\(version \d+\)$/, '');
                if (name) shelves.push({ name, type: 'native', date: null, fileCount: 0 });
            }
            state.shelveList = shelves;
        } else {
            // Fallback: check for local patch-based shelves
            state.shelveList = await loadPatchShelves(project.path);
        }
    } catch (err) {
        hideOperation();
        state.shelveList = await loadPatchShelves(project.path);
    }
    render();
}

async function loadPatchShelves(projectPath) {
    const shelvesDir = projectPath + '/.svn-shelves';
    try {
        const result = await window.api.listDirectory(shelvesDir);
        if (!result || !result.success) return [];

        const shelves = [];
        for (const item of result.items) {
            if (item.name.endsWith('.patch')) {
                const name = item.name.replace('.patch', '');
                let metadata = { date: null, fileCount: 0 };
                // Try reading metadata
                try {
                    const metaPath = shelvesDir + '/' + name + '.meta.json';
                    // We don't have a direct readFile API, but we can try
                    metadata = { date: null, fileCount: 0 };
                } catch (e) { }
                shelves.push({ name, type: 'patch', date: metadata.date, fileCount: metadata.fileCount });
            }
        }
        return shelves;
    } catch (e) {
        return [];
    }
}

async function doShelve() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    const nameInput = document.getElementById('shelve-name-input');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return alert('Please enter a name for the shelf.');

    // Try native shelve first
    const nativeResult = await runSvnSilent(['shelve', name]);
    if (nativeResult && nativeResult.success) {
        logToConsole(`Shelved changes as "${name}" (native SVN).`, 'success');
        if (nameInput) nameInput.value = '';
        await fetchShelveList();
        refreshStatus();
        return;
    }

    // Fallback: patch-based shelve
    logToConsole('Native shelve not supported. Using patch-based fallback...', 'system');
    const diffResult = await runSvnSilent(['diff']);
    if (!diffResult || !diffResult.output || !diffResult.output.trim()) {
        logToConsole('No changes to shelve.', 'warning');
        return;
    }

    const shelvesDir = project.path + '/.svn-shelves';
    const patchPath = shelvesDir + '/' + name + '.patch';

    // IPC write-file returns {success, error} instead of throwing, so we
    // must inspect the result; the outer try/catch would silently swallow
    // a false success.
    const writeRes = await window.api.writeFile(patchPath, diffResult.output);
    if (!writeRes || !writeRes.success) {
        logToConsole(`Failed to create shelf: ${writeRes && writeRes.error ? writeRes.error : 'write failed'}`, 'error');
        return;
    }
    logToConsole(`Patch saved to: ${patchPath}`, 'success');

    // Revert working copy
    if (confirm('Shelf created. Revert all working copy changes now?')) {
        await runSvn(['revert', '-R', '.']);
        logToConsole(`Shelved changes as "${name}" (patch-based). Working copy reverted.`, 'success');
    }

    if (nameInput) nameInput.value = '';
    await fetchShelveList();
}

async function doUnshelve(name) {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    const shelf = state.shelveList.find(s => s.name === name);
    if (!shelf) return;

    if (shelf.type === 'native') {
        const success = await runSvn(['unshelve', name]);
        if (success) {
            logToConsole(`Unshelved "${name}".`, 'success');
            await fetchShelveList();
            refreshStatus();
        }
    } else {
        // Patch-based unshelve
        const patchPath = project.path + '/.svn-shelves/' + name + '.patch';
        const success = await runSvn(['patch', patchPath]);
        if (success) {
            logToConsole(`Unshelved "${name}" (applied patch).`, 'success');
            // Delete the patch file after successful apply
            try {
                await window.api.deleteFile(patchPath, null);
            } catch (e) { }
            await fetchShelveList();
            refreshStatus();
        }
    }
}

async function deleteShelve(name) {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    const shelf = state.shelveList.find(s => s.name === name);
    if (!shelf) return;

    if (shelf.type === 'native') {
        const success = await runSvn(['shelve', '--delete', name]);
        if (success) {
            logToConsole(`Deleted shelf "${name}".`, 'success');
            await fetchShelveList();
        }
    } else {
        const patchPath = project.path + '/.svn-shelves/' + name + '.patch';
        try {
            await window.api.deleteFile(patchPath, null);
            logToConsole(`Deleted shelf "${name}".`, 'success');
            await fetchShelveList();
        } catch (e) {
            logToConsole(`Failed to delete shelf: ${e.message}`, 'error');
        }
    }
}

// === Quick Ignore from Status View ===
async function quickAddIgnoreFromStatus(filePath) {
    const fileName = filePath.split('/').pop();
    const dirPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';

    // Get existing svn:ignore for the directory
    const result = await runSvnSilent(['propget', 'svn:ignore', dirPath]);
    let existing = [];
    if (result && result.output) {
        existing = result.output.split('\n').filter(l => l.trim());
    }

    if (existing.includes(fileName)) {
        logToConsole(`'${fileName}' is already in svn:ignore for '${dirPath}'.`, 'warning');
        return;
    }

    existing.push(fileName);
    const value = existing.join('\n');
    const success = await runSvn(['propset', 'svn:ignore', value, dirPath]);
    if (success) {
        logToConsole(`Added '${fileName}' to svn:ignore in '${dirPath}'.`, 'success');
    }
}

// =============================================
// === SVN Externals Management ===
// =============================================

async function fetchExternals() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        render();
        return;
    }

    state.isScanning = true;
    render();

    const target = state.externalsTarget || '.';
    const result = await runSvnSilent(['propget', 'svn:externals', target]);

    if (result && result.output && result.output.trim()) {
        state.externals = parseExternals(result.output);
    } else {
        state.externals = [];
    }

    state.isScanning = false;
    render();
}

function parseExternals(output) {
    const externals = [];
    const lines = output.split('\n').filter(l => l.trim());

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        let url = '', localDir = '', revision = '', pegRevision = '';

        // Format 1: [-rREV] URL[@PEG] LOCAL_DIR
        // Format 2: LOCAL_DIR [-rREV] URL[@PEG]
        // Detect by checking if first token is a URL (contains ://)
        const tokens = trimmed.split(/\s+/);

        let revToken = '';
        const nonRevTokens = [];
        for (const tok of tokens) {
            if (tok.startsWith('-r')) {
                revToken = tok.replace('-r', '');
            } else {
                nonRevTokens.push(tok);
            }
        }

        if (nonRevTokens.length >= 2) {
            let urlPart, dirPart;
            if (nonRevTokens[0].includes('://') || nonRevTokens[0].startsWith('^/')) {
                // Format 1: URL LOCAL_DIR
                urlPart = nonRevTokens[0];
                dirPart = nonRevTokens[1];
            } else {
                // Format 2: LOCAL_DIR URL
                dirPart = nonRevTokens[0];
                urlPart = nonRevTokens[1];
            }

            // Parse peg revision from URL
            const pegMatch = urlPart.match(/^(.+)@(\d+)$/);
            if (pegMatch) {
                url = pegMatch[1];
                pegRevision = pegMatch[2];
            } else {
                url = urlPart;
            }
            localDir = dirPart;
            revision = revToken;
        } else if (nonRevTokens.length === 1) {
            url = nonRevTokens[0];
            localDir = nonRevTokens[0].split('/').pop();
        }

        externals.push({ url, localDir, revision, pegRevision, raw: trimmed });
    }
    return externals;
}

function renderExternalsView() {
    const project = state.projects[state.selectedProjectIndex];
    if (!project) {
        elements.contentArea.innerHTML = `<div class="empty-state"><p>${t('msg.noProjectSelected')}</p></div>`;
        return;
    }

    let html = '<div class="externals-container">';

    // Target selector
    html += `<div class="section-label">${t('ext.targetDirectory')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="ext-target-input" class="auth-form-input" style="flex:3" placeholder="Directory path (relative, e.g. '.' or 'src')" value="${escapeHtml(state.externalsTarget)}">
            <button class="btn-primary btn-small" onclick="changeExternalsTarget()">${t('btn.load')}</button>
        </div>
    </div>`;

    // Add external form
    html += `<div class="section-label">${t('ext.addExternal')}</div>
    <div class="auth-form">
        <div class="auth-form-row">
            <input type="text" id="ext-new-url" class="auth-form-input" style="flex:3" placeholder="${t('ext.urlPlaceholder')}">
        </div>
        <div class="auth-form-row">
            <input type="text" id="ext-new-localdir" class="auth-form-input" style="flex:2" placeholder="${t('ext.localDirPlaceholder')}">
            <input type="text" id="ext-new-revision" class="auth-form-input" style="flex:1" placeholder="${t('ext.revisionPlaceholder')}">
            <button class="btn-primary btn-small" onclick="addExternal()">${t('btn.addExternal')}</button>
        </div>
    </div>`;

    // Current externals list
    html += `<div class="section-label">${t('ext.currentExternals')} (${state.externals.length})</div>`;

    if (state.externals.length === 0) {
        html += `<div class="empty-state" style="padding: 48px 0;"><p>${t('ext.noExternals')}</p></div>`;
    } else {
        html += '<div class="status-list">';
        for (let i = 0; i < state.externals.length; i++) {
            const ext = state.externals[i];
            const revInfo = ext.revision ? ` @ r${ext.revision}` : (ext.pegRevision ? ` @${ext.pegRevision}` : '');
            html += `
                <div class="status-card">
                    <div class="file-info" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="file-badge badge-added">🔗</span>
                            <span class="file-path" style="font-family: monospace; font-size: 13px;">${escapeHtml(ext.localDir)}</span>
                            <span style="color: var(--text-dim); font-size: 12px;">${revInfo}</span>
                        </div>
                        <div style="padding-left: 36px; color: var(--text-dim); font-size: 12px; word-break: break-all;">${escapeHtml(ext.url)}</div>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        <button class="btn-secondary btn-small" onclick="editExternal(${i})">${t('btn.edit')}</button>
                        <button class="btn-secondary btn-small" style="color: var(--error);" onclick="removeExternal(${i})">${t('btn.remove')}</button>
                    </div>
                </div>`;
        }
        html += '</div>';
    }

    // Edit raw
    html += `<div class="section-label">${t('ext.editRaw')}</div>
    <div class="auth-form">
        <textarea id="ext-raw-textarea" class="commit-textarea" style="min-height: 120px; font-family: monospace;">${escapeHtml(state.externals.map(e => e.raw || buildExternalLine(e)).join('\n'))}</textarea>
        <div style="padding: 8px 0; display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
            <span style="color: var(--text-dim); font-size: 12px;">${t('ext.updateAfterSave')}</span>
            <button class="btn-primary btn-small" onclick="saveExternalsRaw()">${t('btn.saveRaw')}</button>
            <button class="btn-secondary btn-small" onclick="updateExternals()">${t('btn.updateExternals')}</button>
        </div>
    </div>`;

    html += '</div>';
    elements.contentArea.innerHTML = html;
}

function buildExternalLine(ext) {
    let line = '';
    if (ext.revision) line += `-r${ext.revision} `;
    line += ext.url;
    if (ext.pegRevision) line += `@${ext.pegRevision}`;
    line += ` ${ext.localDir}`;
    return line;
}

function changeExternalsTarget() {
    const input = document.getElementById('ext-target-input');
    if (input) {
        state.externalsTarget = input.value.trim() || '.';
        fetchExternals();
    }
}

async function addExternal() {
    const urlInput = document.getElementById('ext-new-url');
    const dirInput = document.getElementById('ext-new-localdir');
    const revInput = document.getElementById('ext-new-revision');

    const url = urlInput ? urlInput.value.trim() : '';
    const localDir = dirInput ? dirInput.value.trim() : '';
    const revision = revInput ? revInput.value.trim() : '';

    if (!url) return alert('Repository URL is required.');
    if (!localDir) return alert('Local directory is required.');

    const newExt = { url, localDir, revision, pegRevision: '', raw: '' };
    newExt.raw = buildExternalLine(newExt);

    const allExternals = [...state.externals, newExt];
    const value = allExternals.map(e => e.raw || buildExternalLine(e)).join('\n');
    const target = state.externalsTarget || '.';

    const success = await runSvn(['propset', 'svn:externals', value, target]);
    if (success) {
        state.externals = allExternals;
        logToConsole(`Added external: ${localDir} → ${url}`, 'success');
        render();
    }
}

async function removeExternal(index) {
    const ext = state.externals[index];
    if (!confirm(`Remove external '${ext.localDir}'?`)) return;

    const newExternals = state.externals.filter((_, i) => i !== index);
    const target = state.externalsTarget || '.';

    if (newExternals.length === 0) {
        const success = await runSvn(['propdel', 'svn:externals', target]);
        if (success) {
            state.externals = [];
            logToConsole(`Removed external: ${ext.localDir}`, 'success');
            render();
        }
    } else {
        const value = newExternals.map(e => e.raw || buildExternalLine(e)).join('\n');
        const success = await runSvn(['propset', 'svn:externals', value, target]);
        if (success) {
            state.externals = newExternals;
            logToConsole(`Removed external: ${ext.localDir}`, 'success');
            render();
        }
    }
}

async function editExternal(index) {
    const ext = state.externals[index];
    const newUrl = prompt('Repository URL:', ext.url);
    if (newUrl === null) return;
    const newDir = prompt('Local Directory:', ext.localDir);
    if (newDir === null) return;
    const newRev = prompt('Revision (leave empty for HEAD):', ext.revision || '');
    if (newRev === null) return;
    if (!newUrl.trim() || !newDir.trim()) {
        alert('Repository URL and Local Directory are required.');
        return;
    }

    const updated = { ...ext, url: newUrl.trim(), localDir: newDir.trim(), revision: newRev.trim() };
    updated.raw = buildExternalLine(updated);

    const allExternals = [...state.externals];
    allExternals[index] = updated;

    const value = allExternals.map(e => e.raw || buildExternalLine(e)).join('\n');
    const target = state.externalsTarget || '.';

    const success = await runSvn(['propset', 'svn:externals', value, target]);
    if (success) {
        state.externals = allExternals;
        logToConsole(`Updated external: ${updated.localDir}`, 'success');
        render();
    }
}

async function saveExternalsRaw() {
    const textarea = document.getElementById('ext-raw-textarea');
    const raw = textarea ? textarea.value : '';
    const target = state.externalsTarget || '.';

    const lines = raw.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
        const success = await runSvn(['propdel', 'svn:externals', target]);
        if (success) {
            state.externals = [];
            logToConsole('All externals removed.', 'success');
            render();
        }
    } else {
        const value = lines.join('\n');
        const success = await runSvn(['propset', 'svn:externals', value, target]);
        if (success) {
            state.externals = parseExternals(value);
            logToConsole('Externals saved.', 'success');
            render();
        }
    }
}

async function updateExternals() {
    const success = await runSvn(['update']);
    if (success) {
        logToConsole('Externals updated via svn update.', 'success');
        fetchExternals();
    }
}

// =============================================
// === Drag & Drop File Operations ===
// =============================================

function setupDragDrop() {
    const contentArea = elements.contentArea;
    if (!contentArea) return;

    // External file drop on content area
    contentArea.addEventListener('dragover', onContentDragOver);
    contentArea.addEventListener('dragleave', onContentDragLeave);
    contentArea.addEventListener('drop', onContentDrop);
}

function onContentDragOver(e) {
    // Only handle in specific views
    const view = state.currentView;
    if (view !== 'status' && view !== 'commit-view' && view !== 'revert-view') return;

    e.preventDefault();
    e.stopPropagation();

    const contentArea = elements.contentArea;
    if (!contentArea.classList.contains('drag-over')) {
        contentArea.classList.add('drag-over');

        // Show drop zone overlay if not already shown
        if (!document.getElementById('drop-zone-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'drop-zone-overlay';
            overlay.className = 'drop-zone-active';
            overlay.innerHTML = `<div class="drop-zone-message">
                <span class="drop-zone-icon">📥</span>
                <span>${t('dnd.dropFilesHere')}</span>
            </div>`;
            contentArea.appendChild(overlay);
        }
    }
}

function onContentDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();

    // Only remove if leaving the content area entirely
    const rect = elements.contentArea.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        removeDropOverlay();
    }
}

function onContentDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    removeDropOverlay();

    const view = state.currentView;
    if (view !== 'status' && view !== 'commit-view' && view !== 'revert-view') return;

    const project = state.projects[state.selectedProjectIndex];
    if (!project) return;

    // Handle external file drops
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        handleExternalFileDrop(files, project);
    }

    // Handle internal card drops (file paths in dataTransfer)
    const filePaths = e.dataTransfer.getData('text/plain');
    if (filePaths) {
        const paths = filePaths.split('\n').filter(p => p.trim());
        for (const path of paths) {
            if (!state.selectedFiles.has(path)) {
                state.selectedFiles.add(path);
            }
        }
        updateBulkUI();
        render();
    }
}

function removeDropOverlay() {
    elements.contentArea.classList.remove('drag-over');
    const overlay = document.getElementById('drop-zone-overlay');
    if (overlay) overlay.remove();
}

async function handleExternalFileDrop(files, project) {
    const cwd = project.path;
    let addedCount = 0;

    for (const file of files) {
        // File.path was removed in Electron 32+; use webUtils via preload.
        // Fall back to file.name only so an unresolved path doesn't hit
        // fs.copyFileSync with a bare filename and succeed silently.
        const filePath = (window.api.getDroppedFilePath && window.api.getDroppedFilePath(file)) || file.path || '';
        if (!filePath) {
            logToConsole(`Could not resolve dropped file path for '${file.name || 'unknown'}' — drag from Finder, not the browser.`, 'error');
            continue;
        }

        // Copy file to working copy directory
        try {
            const fileName = filePath.split('/').pop();
            const targetPath = cwd + '/' + fileName;

            // Copy file via IPC
            const copyResult = await window.api.copyFile(filePath, targetPath);
            if (!copyResult.success) {
                logToConsole(`Failed to copy file: ${copyResult.error}`, 'error');
                continue;
            }

            // svn add the file
            const addResult = await window.api.runSvn(['add', fileName], cwd, null);
            if (addResult.success) {
                addedCount++;
                logToConsole(`Added dropped file: ${fileName}`, 'success');
            }
        } catch (err) {
            logToConsole(`Failed to add dropped file: ${err.message}`, 'error');
        }
    }

    if (addedCount > 0) {
        refreshStatus();
    }
}

function makeCardsDraggable() {
    // Called after rendering status/commit/revert views.
    // Guard against double-binding when MutationObserver fires on
    // re-renders that reuse some DOM nodes.
    const cards = document.querySelectorAll('.status-card');
    cards.forEach(card => {
        if (card.dataset.dragBound === '1') return;
        card.dataset.dragBound = '1';
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', onCardDragStart);
        card.addEventListener('dragend', onCardDragEnd);
    });
}

function onCardDragStart(e) {
    const card = e.currentTarget;
    card.classList.add('dragging');

    // Collect file paths of selected files, or just this card's file
    const filePath = card.querySelector('.file-path');
    if (filePath) {
        const path = filePath.textContent;
        if (state.selectedFiles.size > 0 && state.selectedFiles.has(path)) {
            // Drag all selected files
            e.dataTransfer.setData('text/plain', Array.from(state.selectedFiles).join('\n'));
        } else {
            e.dataTransfer.setData('text/plain', path);
        }
    }

    e.dataTransfer.effectAllowed = 'move';

    // Create ghost image
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    const count = state.selectedFiles.size > 1 ? state.selectedFiles.size : 1;
    ghost.textContent = `${count} file${count > 1 ? 's' : ''}`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
}

function onCardDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// Tree view drag & drop for svn move
function makeTreeNodesDraggable() {
    const fileNodes = document.querySelectorAll('.tree-node-file');
    const folderNodes = document.querySelectorAll('.tree-node:not(.tree-node-file)');

    fileNodes.forEach(node => {
        if (node.dataset.dragBound === '1') return;
        node.dataset.dragBound = '1';
        node.setAttribute('draggable', 'true');
        node.addEventListener('dragstart', onTreeDragStart);
        node.addEventListener('dragend', onTreeDragEnd);
    });

    folderNodes.forEach(node => {
        if (node.dataset.dropBound === '1') return;
        node.dataset.dropBound = '1';
        node.addEventListener('dragover', onTreeFolderDragOver);
        node.addEventListener('dragleave', onTreeFolderDragLeave);
        node.addEventListener('drop', onTreeFolderDrop);
    });
}

function onTreeDragStart(e) {
    e.stopPropagation();
    // Read the absolute path from data-path rather than the displayed
    // leaf name — displayed text is just item.name and loses parent dirs.
    const path = e.currentTarget.dataset.path;
    if (path) {
        e.dataTransfer.setData('text/x-tree-path', path);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
    }
}

function onTreeDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.tree-drop-target').forEach(el => el.classList.remove('tree-drop-target'));
}

function onTreeFolderDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('tree-drop-target');
}

function onTreeFolderDragLeave(e) {
    e.stopPropagation();
    e.currentTarget.classList.remove('tree-drop-target');
}

async function onTreeFolderDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('tree-drop-target');

    const sourcePath = e.dataTransfer.getData('text/x-tree-path');
    if (!sourcePath) return;

    // Prefer the data-path attribute; fall back to tree-name text for the
    // root node if data-path is somehow absent.
    const targetPath = e.currentTarget.dataset.path;
    if (!targetPath) return;
    if (sourcePath === targetPath) return;

    // Guard: a folder cannot be moved into itself or its own descendant.
    if (targetPath === sourcePath || targetPath.startsWith(sourcePath + '/')) {
        logToConsole('Cannot move a folder into itself or a descendant.', 'warning');
        return;
    }

    // Build destination using the source's leaf name so "foo/bar.js" dropped
    // onto "lib/utils" becomes "lib/utils/bar.js".
    const leafName = sourcePath.split('/').pop();
    const destPath = targetPath + '/' + leafName;

    if (!confirm(t('dnd.moveConfirm', { source: sourcePath, target: destPath }))) return;

    const success = await runSvn(['move', sourcePath, destPath]);
    if (success) {
        logToConsole(`Moved '${sourcePath}' to '${destPath}'`, 'success');
        fetchTree();
    }
}

// Post-render hook for drag & drop
function postRenderDragDrop() {
    const view = state.currentView;
    if (view === 'status' || view === 'commit-view' || view === 'revert-view') {
        makeCardsDraggable();
    } else if (view === 'tree') {
        makeTreeNodesDraggable();
    }
}

// Start
setupDragDrop();
init();

// MutationObserver to set up drag-drop on newly rendered elements
const _renderObserver = new MutationObserver(() => {
    postRenderDragDrop();
});
_renderObserver.observe(elements.contentArea, { childList: true });
