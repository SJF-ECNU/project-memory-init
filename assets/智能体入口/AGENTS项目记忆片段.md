## Project Memory

For meaningful repository work, use the repository-local `project-memory` Skill when the client supports repository Skills, and follow [the Project Memory protocol](project-memory/协议.md). If the client does not support Skills, follow the protocol directly.

- Start or resume from [Project Memory Home](project-memory/首页.md), then read the relevant workstream and its most recent linked worklog. Explore older related history from newest to oldest only when the current context is insufficient, and stop when enough information has been recovered.
- Project Memory, the documentation map, and the repository-local Skill follow the current Git checkout. After switching branches or commits, reload context from the current checkout instead of carrying forward cached state from the previous version.
- Verify inherited state against Git, current code and configuration, and the repository's active change specifications before relying on it.
- On completion, handoff, cancellation, or a durable blocker, perform the protocol's closeout flow. Ordinary questions and inconclusive exploration do not create worklogs.

## Information Placement

- Agent instruction files such as `AGENTS.md` and vendor-specific entry files contain only stable, repository-wide instructions that change how an agent should work.
- Code, configuration, architecture documents, runbooks, and change specifications remain the authoritative sources for detailed behavior and procedures.
- Before creating, moving, or superseding authoritative project documentation, follow [the documentation policy](docs/文档规范.md) and update the relevant entry under [Documentation Home](docs/首页.md). Keep transient progress in Project Memory instead of project documentation.
- Stable Project Memory notes summarize project purpose, current boundaries, development cautions, and environment or deployment information, with links to authoritative sources.
- `project-memory/工作流/` stores the current goal, verified progress, blockers, and next step for each bounded stream of work.
- `project-memory/工作记录/` stores append-only evidence for completed, blocked, cancelled, or handed-off work.
- Branch snapshots, documentation inventories, feature inventories, recent progress, deployment steps, environment values, test results, and historical conclusions do not belong in agent instruction files.

Only add instructions to an always-loaded agent file when they are stable, apply across most repository tasks, change agent behavior, and cannot be recovered cheaply through a conditional pointer.
