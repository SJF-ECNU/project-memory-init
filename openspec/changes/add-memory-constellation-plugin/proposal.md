# 变更：新增 2D 记忆星图 Obsidian 插件

## 背景

Project Memory 的双链已经能表达首页、稳定记忆、工作流、工作记录和项目文档之间的关系，但 Obsidian 原生力导向图在节点较多时标签重叠、关系线分散、主次不稳定。用户更在意简洁、高级的情绪体验和可读性，不需要 3D 或复杂交互。

## 变更内容

- 新增独立的 `obsidian-memory-constellation/` Obsidian 插件工程。
- 插件在 `memory-constellation` 分支独立发布；`main` 保留核心 Skill 与模板，仅提供可选插件的短链接。
- 从 Vault Markdown 文件和 Obsidian `resolvedLinks` 构建只读关系模型。
- 使用固定的 2D 语义轨道布局，区分首页、稳定记忆、工作流、工作记录、文档索引和项目文档。
- 提供聚焦/全景、记忆/记忆+文档、搜索、缩放、拖拽、单击聚焦和双击打开。
- 使用克制的深色画布、柔和光晕、曲线连接、渐进标签和短时间聚焦动画。

## 非目标

- 不实现 3D、镜头飞行、持续自转或持续力导向漂移。
- 不替换或修改 Obsidian 原生关系图谱。
- 不写入、移动、重命名或删除 Vault 笔记。
- 不引入数据库、后端服务或脱离 Git 的全局图谱状态。

## 影响

- 新增一个可选 Obsidian 工具和对应 OpenSpec，不改变核心 Skill 的初始化行为。
- 运行时仅读取 Obsidian Vault 文件列表、frontmatter 和链接缓存，无外部服务边界。
