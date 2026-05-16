# JellySvn (SVN Antigravity)

> Forked from [moonlightlakesubp/JellySvn](https://github.com/moonlightlakesubp/JellySvn)

Premium SVN GUI Client built with Electron. Glassmorphism dark-mode UI, multi-language support (EN/KO/ZH-CN), and comprehensive SVN operations.

## Recent Changes — SVN Sparse Checkout

Replaced the legacy placeholder (0-byte file) system with native SVN sparse checkout, delivering a cleaner and faster workflow.

### What Changed

**Sparse Checkout replaces Placeholders**
- Checkout with `--depth empty` creates a lightweight working copy
- Download folders/files on demand with `--set-depth infinity --parents`
- "Clean" button on downloaded folders reverts them to sparse (`--set-depth empty`)
- No more 0-byte placeholder files cluttering the working copy

**Tree View Optimization**
- Entering tree view loads instantly from local cache (no server round-trip)
- Only the "Refresh" button triggers a full `svn list -R` from the remote server
- Remote (not-downloaded) entries shown with cloud icon and "not downloaded" label
- Folder stats show file count and total size instead of placeholder counts

**Default View**
- App launches directly into Tree view (previously Status view)
- Switching projects also navigates to Tree view automatically

**UI Cleanup**
- Removed all "placeholder" terminology from UI, settings, and code
- Removed placeholder toggle and remote URL fields from Settings page
- Added "Clean" button (red accent) for truncating downloaded folders back to sparse
- Simplified commit view — no more placeholder file exclusion logic

### Files Modified

| File | Changes |
|------|---------|
| `app.js` | Sparse checkout logic, tree view refactor, default view, clean button |
| `main.js` | IPC handlers for sparse checkout, remote listing, folder operations |
| `preload.js` | Context bridge methods for new IPC handlers |
| `style.css` | Clean button style, removed placeholder CSS classes |
| `i18n.js` | Sparse checkout i18n keys (EN/KO/ZH-CN), removed placeholder keys |
| `index.html` | Updated checkout modal label |

## Tech Stack

- **Runtime**: Electron 33+ (macOS, hiddenInset titlebar)
- **Frontend**: Vanilla JS / CSS / HTML5
- **SVN**: Native CLI wrapper (`spawn('svn', args)`)
- **Security**: Electron safeStorage for password encryption
- **i18n**: English, Korean, Simplified Chinese

## Setup

1. Install SVN CLI (`svn` must be available in PATH)
2. `npm install`
3. `npm start`

## License

See original repository for license information.
