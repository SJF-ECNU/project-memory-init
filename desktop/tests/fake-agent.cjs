#!/usr/bin/env node
// Process fixture only: exercises the CLI transport, not model quality.
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const claude = path.basename(process.argv[1]) === 'claude';
if (args.includes('--version')) { console.log(claude ? '2.1.236 (Claude Code test fixture)' : 'codex-cli 0.148.0 test fixture'); process.exit(0); }
if (args[0] === 'debug' && args[1] === 'models') { console.log(JSON.stringify({ models: [{ slug: 'test-supported-model', display_name: 'Test model', visibility: 'list' }] })); process.exit(0); }
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => prompt += text);
process.stdin.on('end', async () => {
  fs.writeFileSync('received-prompt.txt', prompt);
  fs.writeFileSync('received-args.json', JSON.stringify(args));
  const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
  emit(claude ? { type: 'system', subtype: 'init' } : { type: 'thread.started' });
  if (claude) emit({ type: 'system', subtype: 'api_retry', error_status: 502 });
  const mode = fs.existsSync('fixture-mode.txt') ? fs.readFileSync('fixture-mode.txt', 'utf8').trim() : process.env.FAKE_AGENT_MODE || 'success';
  if (mode === 'failure') { console.error('请先登录：authentication required'); process.exit(1); }
  if (mode === 'denied') { emit(claude ? { type: 'result', is_error: true, result: '权限不足', permission_denials: [{ tool_name: 'Write' }] } : { type: 'turn.failed', error: { message: '权限不足' } }); return; }
  if (mode === 'wait') {
    const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    fs.writeFileSync('child-pid.txt', String(child.pid));
    setInterval(() => emit(claude ? { type: 'assistant', message: { content: [{ type: 'text', text: '正在调查项目' }] } } : { type: 'item.completed', item: { type: 'agent_message', text: '正在调查项目' } }), 1000); return;
  }
  if (mode !== 'empty') {
    const outputs = ['project-memory/首页.md', 'project-memory/协议.md', 'project-memory/项目概览.md', 'project-memory/项目背景与当前边界.md', 'project-memory/开发与运维注意事项.md', 'project-memory/环境与部署.md', 'project-memory/模板/工作流模板.md', 'project-memory/模板/工作记录模板.md', 'project-memory/工作流/项目记忆初始化.md', '.agents/skills/project-memory/SKILL.md', 'AGENTS.md', 'CLAUDE.md', 'docs/首页.md'];
    for (const relative of outputs) { fs.mkdirSync(path.dirname(relative), { recursive: true }); fs.writeFileSync(relative, '# 模拟初始化产物\nCLI 传输测试文件\n'); }
  }
  const message = '初始化文档已生成';
  const event = claude ? { type: 'assistant', message: { content: [{ type: 'text', text: message }] } } : { type: 'item.completed', item: { type: 'agent_message', text: message } };
  const bytes = Buffer.from(JSON.stringify(event) + '\n');
  process.stdout.write(bytes.subarray(0, bytes.indexOf(Buffer.from('初')) + 1));
  await new Promise(resolve => setTimeout(resolve, 15));
  process.stdout.write(bytes.subarray(bytes.indexOf(Buffer.from('初')) + 1));
  emit(claude ? { type: 'result', is_error: false, result: '执行完成', permission_denials: mode === 'recovered' ? [{ tool_name: 'Bash' }] : [] } : { type: 'turn.completed' });
});
