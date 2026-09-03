# project-memory-init

一套面向代码智能体的项目记忆初始化 Skill：在新仓库或项目记忆明显不完整的仓库中，一次性生成中文、兼容 Obsidian、可跨智能体接续的项目记忆。

它以目标仓库中的事实为准，帮助后续智能体快速回答“项目是什么、当前做到哪里、有哪些边界、如何开发与部署、下一步是什么”。初始化完成后，会在目标项目中生成一个轻量的日常 `project-memory` Skill，负责后续接管、事实刷新和工作收尾。

## 主要特点

- 以仓库根目录作为 Obsidian Vault，使用双链组织项目背景、环境、工作流与工作记录。
- 区分静态文档事实、当前 Git/配置事实、已实时核验事实和未知信息。
- 保留式更新已有文档，不覆盖用户规则，不重置既有工作流。
- 工作记录只追加，并限制接管时读取的历史记录数量，避免上下文无限增长。
- 明确敏感信息、外部系统、生产操作和事实时效边界。
- 生成项目本地的日常 Skill，使不同智能体和会话能够沿用同一套协议。

## 目录结构

```text
project-memory-init/
├── SKILL.md                         # Skill 唯一入口
├── 安装与使用.md                    # 详细安装和使用说明
├── references/
│   └── 初始化规范.md                # 来源调查、交付物和安全边界
└── assets/
    ├── 日常项目记忆Skill模板.md      # 生成到目标仓库的日常 Skill 模板
    └── 项目记忆/                    # Obsidian 项目记忆模板
```

## 安装

克隆到通用 Skill 目录：

```bash
git clone https://github.com/SJF-ECNU/project-memory-init.git ~/.agents/skills/project-memory-init
```

如果客户端只扫描 Codex 专用目录，也可以安装到：

```bash
git clone https://github.com/SJF-ECNU/project-memory-init.git ~/.codex/skills/project-memory-init
```

同一客户端环境只保留一个安装位置，避免重复发现。更多说明见 [安装与使用](安装与使用.md)。

## 使用

在尚未建立项目记忆的项目根目录中，对代码智能体说：

```text
使用 project-memory-init 初始化当前项目。
```

Skill 会调查目标项目，并按实际情况创建或补齐：

- `project-memory/` 中文 Obsidian 项目记忆；
- `.agents/skills/project-memory/SKILL.md` 项目本地日常 Skill；
- 最短的智能体入口指针；
- 初始化工作流和第一篇只追加工作记录。

初始化完成后，普通任务的接管、事实刷新和收尾应使用目标项目生成的 `project-memory` Skill，不重复运行初始化。

## 设计边界

- 本 Skill 只建立或修复项目记忆，不修改应用行为、生产配置、凭据、远端服务或 Git 历史。
- `assets/` 中的 `〔……〕` 是需要根据目标项目事实替换的模板占位符，不是可直接交付的成品内容。
- 文档中登记的环境或部署信息不代表实时在线，也不代表已经获得操作授权。
- 若目标项目已经使用 OpenSpec 或其他变更协议，初始化过程会遵循它；不会为了项目记忆而强行引入新的规范系统。

## 许可证

本仓库目前未附带开源许可证。公开可见不等于自动授予复制、修改或再分发许可。
