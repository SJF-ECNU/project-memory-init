import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, chmod, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import runnerModule from '../electron/agent-runner.cjs'
const { AgentRunner, detectAgents } = runnerModule
const skillRoot = path.resolve('..')
async function fixture(mode, action) {
  const root = await mkdtemp(path.join(tmpdir(), 'agent project ; '))
  const bin = path.join(root, 'bin'); await mkdir(bin)
  for (const name of ['claude', 'codex']) { await copyFile('tests/fake-agent.cjs', path.join(bin, name)); await chmod(path.join(bin, name), 0o755) }
  const env = { ...process.env, PATH: bin + path.delimiter + path.dirname(process.execPath) + path.delimiter + '/usr/bin', FAKE_AGENT_MODE: mode }
  const runner = new AgentRunner({ skillRoot, env })
  try { await action({ root, runner, env }) }
  finally { runner.stop(); await rm(root, { recursive: true, force: true }) }
}
async function waitFor(runner, predicate = job => ['completed', 'failed', 'cancelled'].includes(job?.state)) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) { const job = runner.snapshot(); if (predicate(job)) return job; await new Promise(resolve => setTimeout(resolve, 25)) }
  throw new Error('job did not finish')
}
for (const agent of ['claude', 'codex']) {
  test(`${agent}: real process receives exact cwd and complete Skill, streaming output and actual files`, async () => fixture('success', async ({ root, runner, env }) => {
    assert.equal((await detectAgents(env)).filter(a => a.available).length, 2)
    await runner.start(root, agent)
    const result = await waitFor(runner)
    assert.equal(result.state, 'completed')
    assert.ok(result.logs.includes('初始化文档已生成'))
    const prompt = await readFile(path.join(root, 'received-prompt.txt'), 'utf8')
    assert.ok(prompt.includes('项目文档结构化规范'))
    assert.ok(prompt.includes('assets/项目记忆/首页.md'))
    assert.ok(prompt.includes('保留式'))
    const args = JSON.parse(await readFile(path.join(root, 'received-args.json'), 'utf8'))
    assert.ok(!args.some(a => a.includes('bypass') || a.includes('dangerously')))
    if (agent === 'codex') assert.equal(args[args.indexOf('--add-dir') + 1], path.join(root, '.agents'))
    assert.equal(await readFile(path.join(root, 'CLAUDE.md'), 'utf8'), '# 模拟初始化产物\nCLI 传输测试文件\n')
  }))
}
test('missing CLI is unavailable', async () => {
  assert.ok((await detectAgents({ PATH: '/nonexistent-agent-directory' })).every(a => !a.available))
})
test('zero exit with no outputs is incomplete, not success', async () => fixture('empty', async ({ root, runner }) => {
  await runner.start(root, 'codex'); const result = await waitFor(runner)
  assert.equal(result.state, 'failed'); assert.ok(result.missing.includes('project-memory/首页.md'))
}))
for (const mode of ['failure', 'denied']) {
  test(`${mode} is reported as failure`, async () => fixture(mode, async ({ root, runner }) => {
    await runner.start(root, 'claude'); const result = await waitFor(runner)
    assert.equal(result.state, 'failed'); assert.ok(result.logs.join('\n').includes(mode === 'failure' ? 'authentication' : '权限'))
  }))
}
test('rejects unsupported agents and concurrent jobs, cancellation terminates subprocess group', async () => fixture('wait', async ({ root, runner }) => {
  await assert.rejects(runner.start(root, 'arbitrary'), /只支持/)
  await runner.start(root, 'codex')
  await assert.rejects(runner.start(root, 'claude'), /已有/)
  await waitFor(runner, job => job.logs.some(line => line === '正在调查项目'))
  const childPid = Number(await readFile(path.join(root, 'child-pid.txt'), 'utf8'))
  runner.stop(); assert.equal((await waitFor(runner)).state, 'cancelled')
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.throws(() => process.kill(childPid, 0), /ESRCH/)
}))

test('does not authorize a project Skill directory linked outside the project', async () => fixture('success', async ({ root, runner }) => {
  const outside = await mkdtemp(path.join(tmpdir(), 'outside-skill-'))
  try {
    await symlink(outside, path.join(root, '.agents'))
    await runner.start(root, 'codex')
    assert.equal(runner.snapshot().state, 'failed')
    assert.match(runner.snapshot().message, /指向外部/)
    await assert.rejects(readFile(path.join(root, 'received-prompt.txt'), 'utf8'), /ENOENT/)
  } finally { await rm(outside, { recursive: true, force: true }) }
}))

test('Codex model catalog and explicit selection avoid inheriting an incompatible default', async () => fixture('success', async ({ root, runner, env }) => {
  const codex = (await detectAgents(env)).find(a => a.id === 'codex')
  assert.deepEqual(codex.models, [{ id: 'test-supported-model', name: 'Test model' }])
  await assert.rejects(runner.start(root, 'codex', '--sandbox danger-full-access'), /有效/)
  await runner.start(root, 'codex', codex.models[0].id)
  assert.equal((await waitFor(runner)).state, 'completed')
  const args = JSON.parse(await readFile(path.join(root, 'received-args.json'), 'utf8'))
  assert.equal(args[args.indexOf('--model') + 1], 'test-supported-model')
  assert.equal(runner.snapshot().model, 'test-supported-model')
}))
test('Claude API retries are visible with upstream status', async () => fixture('success', async ({ root, runner }) => {
  await runner.start(root, 'claude')
  const job = await waitFor(runner)
  assert.ok(job.logs.some(line => line.includes('HTTP 502') && line.includes('CC Switch')))
}))
test('a recovered auxiliary permission denial retains its warning without discarding completed files', async () => fixture('recovered', async ({ root, runner }) => {
  await runner.start(root, 'claude')
  const job = await waitFor(runner)
  assert.equal(job.state, 'completed')
  assert.match(job.message, /部分操作未获许可/)
  assert.ok(job.logs.some(line => line.includes('权限限制已保留')))
}))
