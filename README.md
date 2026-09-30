# 项目工作台 · Project Memory App

独立于 Obsidian 的本地 Vue + Electron 应用，用于按项目组织、浏览和编辑开发上下文。

这是 **`project-memory-app` 桌面应用分支**。项目记忆初始化 Skill 与模板由 [main 分支](https://github.com/SJF-ECNU/project-memory-init/tree/main)维护；Obsidian 记忆星图位于 [memory-constellation 分支](https://github.com/SJF-ECNU/project-memory-init/tree/memory-constellation)。应用入口与运行命令在 `desktop/`，无需安装 Obsidian。

## 功能

- 选择本地项目；左侧选择规则、开发日志、设计方案等内容分类。
- 中央瀑布流卡片展示文件路径、正文概要和完整更新日期；时间排序按今天、昨天、近 7 天与更早月份分组。
- 搜索标题、路径和正文；排序、刷新、正文阅读与返回位置恢复。
- 编辑已有 UTF-8 Markdown、纯文本和文本 dotfile，支持保存快捷键、未保存提示和外部修改冲突提示。
- 选择本机已安装的 Claude Code 或 Codex，一键补齐项目文档入口与上下文；查看输出、停止并重新打开后台任务。
- 内容保留在项目原目录，普通浏览不写文件。概要来自正文摘录。

## 运行

需要 Node.js 22.12 或更新版本及 npm。

```bash
git clone --branch project-memory-app --single-branch https://github.com/SJF-ECNU/project-memory-init.git project-memory-app
cd project-memory-app/desktop
npm ci
npm run build
npm start
```

打开后选择项目目录。初始化功能需要先在本机安装并配置 Claude Code 或 Codex；应用不自动安装 CLI 或管理账号凭据。

完整操作说明、文件读写范围和初始化权限见 [桌面端 README](desktop/README.md)。

## 开发与验证

```bash
cd desktop
npm run dev
```

```bash
cd desktop
npm test
npm run build
npm run test:ui
```

UI 测试运行真实 Electron；初始化回归使用模拟 CLI，真实 CLI 验证另行显式运行。依赖、构建产物和测试报告不提交。

当前为 **0.1.0 源码分支发布**，尚无签名安装包、自动更新、日常智能整理或语义问答。没有把源码分支发布描述为应用商店上架。

## 项目文档

- [文档首页](docs/首页.md)
- [桌面设计与任务](openspec/changes/add-project-desktop/design.md)
- [本机 Agent 初始化](openspec/changes/add-agent-project-initialization/design.md)
- [文件编辑](openspec/changes/add-file-editing/design.md)
- [项目接管入口](project-memory/首页.md)

## 许可

[MIT](LICENSE)
