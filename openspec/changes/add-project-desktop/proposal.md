# 独立项目内容工作台

## Why
用户需要脱离 Obsidian，在自己的桌面产品中选择项目、按具体内容类型浏览文件，并从卡片概要进入正文。现有插件依赖 Vault，无法承载这个工作流。

## What Changes
- 新增独立 Vue + Electron 应用，读取用户选择的本地项目 Markdown。
- 左侧只显示项目切换和分类；中央显示瀑布流卡片，包含标题、相对路径、正文摘要，卡片外显示更新日期。
- 支持搜索、排序、刷新和正文阅读，返回恢复浏览位置。
- 首版不修改项目文件；编辑、模型整理、语义问答、自动状态判定及打包签名是后续范围。

## Capabilities
### New Capabilities
- `project-desktop`: 本地项目分类浏览和阅读。
### Modified Capabilities
无。原插件保持只读且不修改。

## Impact
新增 desktop 工程、文档索引与项目工作流；不依赖 Obsidian 或云端服务。
