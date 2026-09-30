---
type: worklog
project: project-memory-init
workstream: agent-project-initialization
status: completed
recorded_at: 2026-09-30T19:20:30+08:00
started_at: unknown
completed_at: 2026-09-30T19:20:30+08:00
timezone: Asia/Shanghai
agent: Codex
client: Codex desktop
model: unknown
session_id: unavailable
branch: memory-constellation
commit: null
---

# 初始化 CLI 兼容与转发修复

## 目标与结果

解决前一记录中真实 Claude 无结果、Codex 默认模型不兼容的问题。两个真实 CLI 已在隔离示例项目完成核心文件生成，原 README 和 notes/design.md 保留。

## 原因与修复

- Claude 请求到达 CC Switch，但其转发到已选 DeepSeek 供应商时上游 DNS/连接失败，约 60 秒返回 502。直连解析超时，通过已有本地代理可达。用户明确选择继续使用 CC Switch；把其 global_proxy_url 从未配置改为 http://127.0.0.1:7890 并重启，UI 确认生效，随后请求返回 200。本次仅修改该出站设置，不改系统代理、凭据或供应商；它影响 CC Switch 的出站请求。恢复方法是 CC Switch 设置 → 路由 → 全局出站代理 → 清除。
- Codex 0.148.0 配置的 gpt-6.1-sol 与当前 CLI 登录不兼容，而 CLI 模型目录提供其他模型。主进程从 codex debug models --bundled 获取目录，中央面板新增本次模型选择；--model 只作用于子进程，不改全局 config.toml，也不静默自动切换模型。
- Claude 的 API 重试事件现在显示 HTTP 状态和服务检查提示。辅助命令被拒绝后 Agent 可以改用专用工具完成；若正常结束且必要入口非空，保留警告而不误判整项失败。最终 is_error、非零退出或缺失必要产物仍失败，既有权限限制未放宽。
- 明确提示 Markdown 相对链接按包含文件目录计算，验证优先用 Read/Glob/Grep，避免生成项目外临时验证脚本。

## 改动

- [执行器](../../../../desktop/electron/agent-runner.cjs)：目录检测、模型校验与参数、API 重试摘要和恢复后的权限警告。
- [面板](../../../../desktop/src/InitializationPanel.vue)、App、preload 与主进程：模型选择及 IPC 传输。
- Node 测试、Electron 初始化测试、真实 CLI 测试改为直接调用产品模型参数。

## 参考与文档产物

依据原 [初始化设计](../../../../openspec/changes/add-agent-project-initialization/design.md)、CLI 帮助及 CC Switch v3.20.0 的出站设置存储实现。
更新该 OpenSpec 的设计/规格/任务、[桌面说明](../../../../desktop/README.md)、工作流与稳定运维摘要；新增本记录。已有工作记录未改写。

## 验证

- 14 项 Node 测试全部通过，包括模型目录和参数、非法输入、重试状态、恢复权限拒绝、终止进程组、缺失文件与外部符号链接。
- 生产构建通过；两个 Electron UI 测试通过，覆盖 Codex 模型默认选择和 IPC 实际参数、浏览回归、停止、失败与窄窗。
- 真实 Claude 2.1.236 继续使用 CC Switch，在示例项目生成全部核心入口；真实 Codex 0.148.0 使用产品 --model gpt-5.6-luna 参数完成；两份报告位于被忽略的 desktop/test-results/real-claude-init.json 和 real-codex-supported-model-init.json。
- 单独最小请求确认目录首选 gpt-5.6-sol 也可正常响应；不改变全局默认模型。
- 原 README 和 notes/design.md 独立比对均保持原文。只验证示例资料和启动/生成路径，不把该结果推广为所有生成内容质量保证。
- 正常工作台重启加载修复版；没有在开发仓库执行初始化。转发修复前值另存于被忽略的 test-results/cc-switch-outbound-repair.json，仅包含非敏感代理地址。

## 剩余工作与下一步

运行阻塞已解决。生成内容仍需核对：早期 Claude 实测存在错误的 Markdown 相对路径，已加强提示；最终 Claude 与 Codex 样例的有效链接检查通过（排除模板和代码示例）；应用完成判断仍是核心入口存在与最终状态，不是语义或全量链接验收。普通浏览的正文链接当前不跳转。后续使用初始化按钮选择真实目标项目并检查生成内容。

## 引用

- [[project-memory/首页]]
- [[project-memory/工作流/本机Agent项目初始化]]
