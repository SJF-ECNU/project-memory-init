---
type: worklog
project: project-memory-init
workstream: agent-project-initialization
status: completed
recorded_at: 2026-09-30T18:55:47+08:00
started_at: unknown
completed_at: 2026-09-30T18:55:47+08:00
timezone: Asia/Shanghai
agent: Codex
client: Codex desktop
model: unknown
session_id: unavailable
branch: memory-constellation
commit: null
---

# 本机 Agent 项目初始化实现

## 目标与结果

实现用户要求的本机 Claude/Codex 选择和一键项目初始化。中央面板展示版本、进度、失败、缺失输出与停止入口；完成后刷新文件分类。浏览仍只读，初始化按钮授权该项目文档写入。

## 改动

- [执行器](../../../../desktop/electron/agent-runner.cjs)：固定 CLI 参数、标准输入传入根 Skill 与模板、无 shell 拼接、单任务、结构化输出和进程组停止。Codex 使用 workspace-write 并仅额外授权项目内 .agents，拒绝该目录指向项目外；Claude 每次使用空 MCP 配置避免无关启动阻塞，保留原模型和账号。
- [主进程](../../../../desktop/electron/main.cjs) 与 preload：只允许已选项目执行、状态订阅与退出清理。
- [初始化面板](../../../../desktop/src/InitializationPanel.vue) 与 App：Agent 选择、运行输出及完成刷新。
- [构建复制](../../../../desktop/electron/copy-init-skill.mjs)：携带初始化资产，无需用户安装 Skill。
- [执行器测试](../../../../desktop/tests/agent-runner.test.mjs)、Electron 初始化测试与显式真实 CLI 测试脚本。

## 参考与文档产物

依据根 [Skill](../../../../SKILL.md) 及 references 的初始化、文档结构和入口规范；没有 CodeGraph 索引，采用有界源码调查。
新增 [OpenSpec](../../../../openspec/changes/add-agent-project-initialization/proposal.md)、设计、规格和任务；更新 [桌面 README](../../../../desktop/README.md)、根 README、产品与变更索引、稳定记忆与首页，新增本工作流和记录。既有插件未修改。

## 验证

- 11 项 Node 测试通过；覆盖真实临时文件、两个模拟 CLI、路径含空格、stdin、缺失产物、鉴权错误、拒绝权限、并发、取消子进程以及外部 .agents 符号链接。
- Vue 生产构建与资产复制通过。真实 Electron 浏览回归和初始化交互测试均通过；初始化测试使用模拟 CLI，涵盖选择、进度、成功刷新、失败、重开面板、停止和窄窗口布局。
- 真实 Codex 0.148.0 默认模型 gpt-6.1-sol 与当前 ChatGPT 登录不兼容，错误被正确显示。仅测试进程临时指定 gpt-5.6-luna 后，隔离示例项目完整生成核心文件并保留原 README。报告在被忽略的 desktop/test-results/real-codex-supported-model-init.json。应用未覆盖默认模型或修改全局配置。
- 真实 Claude 2.1.236 检测和启动成功；使用每次空 MCP 配置后立即输出启动事件，但约 8 分钟未返回生成结果，主动停止该测试进程组，原 README 保留。报告在被忽略的 desktop/test-results/real-claude-init.json。不推断具体网络或服务原因，不宣称真实 Claude 完整成功。
- 工作台正常桌面窗口显示新初始化面板；未在开发仓库点击实际初始化。
- 完成判断验证核心文件存在且非空，不代替生成内容质量评审。

## 剩余工作与下一步

真实 Claude 的服务调用仍需本机独立排查；正文编辑、日常整理和安装包不在本次范围。所有实测均使用临时示例项目，测试进程已停止；未改账号、代理或模型全局配置，未提交或发布。

## 引用

- [[project-memory/首页]]
- [[project-memory/工作流/本机Agent项目初始化]]
