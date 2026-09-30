# Repository instructions

## Project Memory

For meaningful repository work, use the repository-local `project-memory` Skill when the client supports repository Skills, and follow [the Project Memory protocol](project-memory/协议.md). If the client does not support Skills, follow the protocol directly.

- Start or resume from [Project Memory Home](project-memory/首页.md), then read the relevant workstream and its most recent linked worklog. Explore older related history from newest to oldest only when the current context is insufficient.
- Project Memory, the documentation map, and the repository-local Skill follow the current Git checkout. After switching branches or commits, reload context from the current checkout instead of carrying forward cached state from the previous version.
- Verify inherited state against Git, current code and configuration, and the repository's active change specifications before relying on it.
- On completion, handoff, cancellation, or a durable blocker, perform the protocol's closeout flow. Ordinary questions and inconclusive exploration do not create worklogs.

## Information Placement

- Agent instruction files contain only stable, repository-wide instructions that change how an agent should work.
- Code, configuration, architecture documents, runbooks, and OpenSpec changes remain the authoritative sources for detailed behavior and procedures.
- Before creating, moving, or superseding authoritative project documentation, follow [the documentation policy](docs/文档规范.md) and update the relevant entry under [Documentation Home](docs/首页.md). Keep transient progress in Project Memory instead of project documentation.
- Stable Project Memory notes summarize purpose, current boundaries, development cautions, and environment or deployment information, with links to authoritative sources. Workstreams hold current goals; worklogs hold append-only evidence.
- Branch snapshots, feature inventories, recent progress, deployment steps, environment values, test results, and historical conclusions do not belong in this file.

## Change Discipline

- For behavior changes, inspect the applicable OpenSpec change before editing and update its required artifacts when the change is in scope. Do not treat source tests or a production build as evidence of foreground Obsidian interaction acceptance.
- Keep the plugin read-only with respect to Vault notes. Do not add generated `main.js` or `node_modules/` to Git.

## Collaboration and Implementation

- 所有面向用户的输出最后加“喵～”。可使用子代理处理独立且有界的工作；完成后关闭不再需要的子代理。
- 不默认新增 Hash、冻结 Contract、Baseline 或 Gate。只有存在可说明的具体失败场景，且 Git、版本、主键、事务、唯一约束、类型系统和普通测试均不足以避免它时，才可引入；Gate 只用于不可逆操作、跨系统交互、安全边界或正式发布边界。
- 编写代码前先明确假设、取舍和成功标准。仓库存在 `.codegraph/` 时，先用 CodeGraph 调查结构；不存在时再做有界源码调查。代码任务使用 OpenSpec 形成可评审计划。
- 保持最小、外科式改动：每一行都直接服务于当前请求，不清理无关代码，不加入未请求的抽象或配置。删除因本次改动造成的无用项。
- 将每个目标转为可验证结果并完成相称检查；以真实运行、模拟或实测补充前置检查，而不是用前置检查替代执行。

Only add instructions to this always-loaded file when they are stable, apply across most repository tasks, change agent behavior, and cannot be recovered cheaply through a conditional pointer.
