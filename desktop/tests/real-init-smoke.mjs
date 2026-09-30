// Explicit opt-in: runs the installed CLI with its existing account/model settings.
import { mkdtemp, writeFile, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import module from '../electron/agent-runner.cjs'
const agent = process.argv[2]
if (!['claude', 'codex'].includes(agent)) throw new Error('Pass claude or codex explicitly')
const root = await realpath(await mkdtemp(path.join(tmpdir(), `real-${agent}-init-project-`)))
const original = '# 文档索引示例项目\n\n本项目只有示例资料，用于验证桌面初始化入口。没有应用代码、生产环境或部署服务。\n\n资料入口：[设计说明](notes/design.md)。\n'
await mkdir(path.join(root, 'notes'))
await writeFile(path.join(root, 'README.md'), original)
await writeFile(path.join(root, 'notes/design.md'), '# 设计说明\n\n项目资料使用 Markdown。初始化应保留现有资料路径和正文，只补充入口与项目接续记录。\n')
await mkdir('test-results', { recursive: true })
let last = ''
const env = module.cliEnvironment()
const testModel = process.argv[3]
if (testModel) {
  if (agent !== 'codex' || !/^[a-z0-9.-]+$/.test(testModel)) throw new Error('Only an explicit Codex model slug is accepted')
}
const runner = new module.AgentRunner({ skillRoot: path.resolve('dist/initializer'), env, onUpdate: job => {
  const text = job.logs.at(-1) || job.message
  if (text !== last) { last = text; console.log(`${job.state}: ${text.slice(0, 180)}`) }
} })
const deadline = setTimeout(() => runner.stop(), 12 * 60 * 1000)
await runner.start(root, agent, testModel || '')
while (module.active(runner.snapshot().state)) await new Promise(resolve => setTimeout(resolve, 1000))
clearTimeout(deadline)
const job = runner.snapshot()
const report = { agent, testModel: testModel || null, root, state: job.state, message: job.message, missing: job.missing, preservedReadme: await readFile(path.join(root, 'README.md'), 'utf8') === original, rootFiles: await readdir(root) }
await writeFile(`test-results/real-${agent}${testModel ? '-supported-model' : ''}-init.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
if (job.state !== 'completed' || !report.preservedReadme) process.exitCode = 1
