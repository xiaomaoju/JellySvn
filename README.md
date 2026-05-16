# JellySvn

> Forked from [moonlightlakesubp/JellySvn](https://github.com/moonlightlakesubp/JellySvn)

[English](docs/README_EN.md) | 中文

基于 Electron 的 SVN 图形化客户端。

## 功能

- **状态管理** — 查看文件状态，支持批量 Add / Revert / Delete / Ignore
- **提交 & 更新** — 选择文件提交，支持全部更新或按文件更新
- **日志查看** — 按关键词、作者、日期筛选提交历史，支持版本对比
- **目录树** — 可视化项目结构，支持 SVN Sparse Checkout 按需下载
- **冲突解决** — Mine / Theirs / Revert 一键操作
- **分支管理** — 创建分支/标签，切换分支
- **锁定管理** — 锁定/解锁文件，查看锁定状态
- **Blame 视图** — 逐行显示作者和修订号
- **合并操作** — 支持 dry-run 预览和 reintegrate 合并
- **Diff 查看** — 内联 / 并排对比模式，支持外部 Diff 工具
- **SVN 属性** — proplist / propget / propset / propdel
- **Externals** — 查看/添加/编辑/删除 svn:externals
- **Sparse Checkout** — 轻量检出，按需下载文件夹，一键清理恢复
- **Patch** — 生成和应用 unified diff 补丁
- **搜索** — 文件名和文件内容搜索
- **拖放操作** — 外部文件拖入添加，Tree 视图内拖动移动
- **多语言** — 中文 / English / 한국어
- **暗色主题** — Dark / Midnight Blue / Forest Green

## 安装

```bash
npm install
npm start
```

需要系统已安装 `svn` 命令行工具。

## 构建

```bash
npm run build:mac   # macOS (dmg + zip)
npm run build:win   # Windows (安装包 + 便携版)
```

推送 `v*` 标签自动触发 GitHub Actions 构建并发布 Release。

## 许可证

MIT
