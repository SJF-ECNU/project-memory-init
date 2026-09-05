# Memory Constellation · 记忆星图

为 Project Memory 提供清晰、轻盈的 Obsidian 2D 关系视图。

这是 **`memory-constellation` 插件分支**。项目的核心 Skill、跨 Agent 记忆同步规范和初始化模板继续在 [main 分支](https://github.com/SJF-ECNU/project-memory-init/tree/main)维护；使用它们不需要安装本插件。此分支沿用共同的仓库基础，插件实现独立放在 `obsidian-memory-constellation/`，不合并回主分支。

## 提供什么

- 按记忆、工作流、工作记录和项目文档组织的稳定 2D 布局。
- 低饱和分层配色、玻璃风格控件、短范围过渡与 10 秒生长重播。
- 悬停查看关系，单击锁定 / 取消，双击打开笔记。
- 可筛选的关联笔记侧栏，以及按标题、文件名和路径定位的搜索。
- 只读当前 Vault，不修改笔记、不创建数据库，随 Git checkout 的文件与链接刷新。

## 构建与安装

需要 Node.js 22 或更新版本及 npm。

```bash
git clone --branch memory-constellation --single-branch https://github.com/SJF-ECNU/project-memory-init.git memory-constellation
cd memory-constellation/obsidian-memory-constellation
npm ci
npm test
npm run build
```

把生成的 `main.js` 连同 `manifest.json`、`styles.css` 放进目标 Vault 的 `.obsidian/plugins/memory-constellation/`，在 Obsidian 第三方插件设置中启用 **Memory Constellation**，然后运行“打开记忆星图”。更新已有安装时，先备份这三个文件。

这是源码分支发布，不是 Obsidian 社区插件商店上架；本分支不提交 `node_modules/` 或生成的 `main.js`。

完整的交互、目录范围与安装说明见 [插件文档](obsidian-memory-constellation/README.md)。

## 开发与状态

源代码和测试位于 [obsidian-memory-constellation/](obsidian-memory-constellation/)，设计与验收进度位于 [OpenSpec](openspec/changes/add-memory-constellation-plugin/tasks.md)。

当前版本为 **0.1.0**。自动化测试和生产构建不代表全部实机视觉验收已完成；最新侧栏与部分动态效果仍需前台交互验收，详见任务记录。

## 许可

[MIT](LICENSE)
