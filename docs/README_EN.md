# JellySvn

> Forked from [moonlightlakesubp/JellySvn](https://github.com/moonlightlakesubp/JellySvn)

English | [中文](../README.md)

Electron-based SVN GUI client.

## Features

- **Status** — View file status, bulk Add / Revert / Delete / Ignore
- **Commit & Update** — Selective commit, full or per-file update
- **Log** — Filter history by keyword, author, date; compare revisions
- **Tree View** — Visual project structure with SVN Sparse Checkout on demand
- **Conflict Resolution** — One-click Mine / Theirs / Revert
- **Branch Management** — Create branches/tags, switch branches
- **Lock Management** — Lock/unlock files, view lock status
- **Blame View** — Line-by-line author and revision display
- **Merge** — Dry-run preview and reintegrate merge
- **Diff Viewer** — Inline / side-by-side mode, external diff tool support
- **SVN Properties** — proplist / propget / propset / propdel
- **Externals** — View / add / edit / remove svn:externals
- **Sparse Checkout** — Lightweight checkout, download folders on demand, one-click clean
- **Patch** — Create and apply unified diff patches
- **Search** — Filename and content search
- **Drag & Drop** — Drop external files to add, drag to move in Tree view
- **i18n** — 中文 / English / 한국어
- **Dark Themes** — Dark / Midnight Blue / Forest Green

## Install

```bash
npm install
npm start
```

Requires `svn` CLI installed on your system.

## Build

```bash
npm run build:mac   # macOS (dmg + zip)
npm run build:win   # Windows (installer + portable)
```

Push a `v*` tag to trigger GitHub Actions build and release.

## License

MIT
