# 本机 Agent 一键项目初始化

## Why
用户需要在桌面端选择本机已经安装的 Claude 或 Codex，直接为选中的项目执行保留式初始化，无需手动复制提示词或安装 Skill。

## What Changes
- 新增初始化入口和中央执行面板，检测 Claude/Codex 可执行文件与版本，选择后启动。
- 复用仓库 project-memory-init Skill、规范和模板，在构建时随应用携带，通过标准输入交给本机 CLI。
- 主进程执行受限的固定 CLI 参数，展示实时进度、失败信息、停止和重试；结束后刷新卡片。
- 区分 Agent 正常退出与必要入口文件实际存在；不以退出码单独宣称初始化成功。
- 用户点击开始授权当前项目初始化写入，普通阅读和既有插件仍只读。

## Capabilities
### New Capabilities
- `project-initialization`: 本机 Claude/Codex 的初始化执行与状态展示。
### Modified Capabilities
无。已选项目的安全读取边界保持不变。

## Impact
desktop 主进程、preload、Vue 主界面、构建资源、测试与运行说明。沿用本机 CLI 登录与模型配置，不读取或保存凭据，不自动安装 Agent，不改应用代码或生产配置。
