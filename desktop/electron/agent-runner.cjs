const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const agentNames = { claude: 'Claude Code', codex: 'Codex' };
const requiredFiles = [
  'project-memory/首页.md', 'project-memory/协议.md', 'project-memory/项目概览.md',
  'project-memory/项目背景与当前边界.md', 'project-memory/开发与运维注意事项.md', 'project-memory/环境与部署.md',
  'project-memory/模板/工作流模板.md', 'project-memory/模板/工作记录模板.md', 'project-memory/工作流/项目记忆初始化.md',
  '.agents/skills/project-memory/SKILL.md', 'AGENTS.md', 'CLAUDE.md',
];
function cliEnvironment(env = process.env) {
  const extras = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin'), path.join(os.homedir(), '.npm-global/bin'), path.join(os.homedir(), '.volta/bin')];
  const result = { ...env, PATH: [...new Set([...(env.PATH || '').split(path.delimiter), ...extras])].filter(Boolean).join(path.delimiter) };
  // A desktop invocation is a separate CLI session, not a nested Claude turn.
  delete result.CLAUDECODE;
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}
async function detectAgents(env = cliEnvironment()) {
  return Promise.all(Object.entries(agentNames).map(async ([id, name]) => {
    for (const directory of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
      const executable = path.join(directory, process.platform === 'win32' ? id + '.exe' : id);
      try {
        await fs.access(executable, constants.X_OK);
        const { stdout } = await execute(executable, ['--version'], { env, timeout: 5000, maxBuffer: 16384 });
        const models = [];
        if (id === 'codex') {
          try {
            const catalog = await execute(executable, ['debug', 'models', '--bundled'], { env, timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
            for (const model of JSON.parse(catalog.stdout).models || []) {
              if (model.visibility === 'list' && /^[a-zA-Z0-9][a-zA-Z0-9._:[\]-]{0,119}$/.test(model.slug)) models.push({ id: model.slug, name: model.display_name || model.slug });
            }
          } catch { /* Older CLIs can still use their configured model. */ }
        }
        return { id, name, available: true, executable, version: stdout.trim().slice(0, 160), models };
      } catch { /* Try the next installed location. */ }
    }
    return { id, name, available: false, version: '', executable: '' };
  }));
}
async function buildPrompt(skillRoot) {
  const sections = [];
  async function read(relative) {
    const location = path.join(skillRoot, relative);
    const stat = await fs.stat(location);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(location)).sort()) await read(path.join(relative, name));
    } else if (/\.md$/i.test(relative)) {
      sections.push(`\n<skill-file path="${relative}">\n${await fs.readFile(location, 'utf8')}\n</skill-file>`);
    }
  }
  for (const entry of ['SKILL.md', 'references', 'assets']) await read(entry);
  return `请在当前工作目录执行完整的 project-memory-init 初始化。用户已授权当前项目内的保留式初始化写入。\n只支持文档、项目记忆、本地 Skill 和智能体入口；不得修改应用源码、生产配置、凭据、Git 历史，不执行发布、不安装依赖。已有资料保留，完整时核验后说明无需重建。\nMarkdown 相对链接必须按包含链接的文件所在目录计算，例如 project-memory/首页.md 指向根 AGENTS.md 时用 ../AGENTS.md，不能直接用 AGENTS.md。双链使用仓库根相对路径。辅助验证优先用 Read、Glob、Grep；不创建或运行临时验证脚本，也不在项目外写入文件。\n以下是随应用携带的 Skill 及其规范和模板全文，路径相对 Skill 根，已经提供全文的资源无需寻找外部安装路径。请遵循它们，实际执行初始化和适当验证，而不只提出计划。不能完成时明确报告原因，不编造资料。最后简要说明生成路径、验证和待核对项。\n${sections.join('\n')}`;
}
function commandArgs(agent, root, model = '') {
  if (agent === 'codex') return [...(model ? ['--model', model] : []), '-a', 'never', 'exec', '--sandbox', 'workspace-write', '--add-dir', path.join(root, '.agents'), '--skip-git-repo-check', '--json', '--color', 'never', '-'];
  const readCommands = ['git status', 'git branch', 'git rev-parse', 'git diff', 'git log', 'ls', 'rg', 'find', 'cat', 'head', 'sed', 'wc', 'date', 'codegraph explore', 'openspec validate'];
  return ['--print', '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--permission-mode', 'acceptEdits', '--tools', 'Read,Write,Edit,Glob,Grep,Bash', '--allowedTools', ['Read', 'Write', 'Edit', 'Glob', 'Grep', ...readCommands.map(cmd => `Bash(${cmd} *)`)].join(',')];
}
function parseEvent(agent, event) {
  if (agent === 'claude') {
    if (event.type === 'assistant') return (event.message?.content || []).flatMap(block => block.type === 'text' ? [block.text] : block.type === 'tool_use' ? [`正在执行 ${block.name}`] : []);
    if (event.type === 'result') return [event.result || '', ...(event.errors || [])];
    if (event.type === 'system' && event.subtype === 'init') return ['Claude 已启动，正在调查项目'];
    if (event.type === 'system' && event.subtype === 'api_retry') return [`模型服务请求失败，CLI 正在重试${event.error_status ? `（HTTP ${event.error_status}）` : ''}。若持续出现，请检查 CC Switch 或供应商的出站连接。`];
  } else {
    if (event.type === 'thread.started') return ['Codex 已启动，正在调查项目'];
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') return [event.item.text];
    if (event.type === 'item.started' && event.item?.type === 'command_execution') return ['正在调查或验证项目文件'];
    if (event.type === 'item.completed' && event.item?.type === 'file_change') return ['项目文档已更新'];
    if (event.type === 'error' || event.type === 'turn.failed') return [event.message || event.error?.message || 'Agent 执行失败'];
  }
  return [];
}
async function checkOutputs(root) {
  const missing = [];
  for (const name of requiredFiles) {
    try { const stat = await fs.lstat(path.join(root, name)); if (!stat.isFile() || !stat.size) missing.push(name); }
    catch { missing.push(name); }
  }
  return missing;
}
const active = state => ['starting', 'running', 'stopping', 'checking'].includes(state);
class AgentRunner {
  constructor({ skillRoot, onUpdate = () => {}, env = cliEnvironment() }) {
    this.skillRoot = skillRoot; this.onUpdate = onUpdate; this.env = env; this.job = null; this.child = null;
  }
  snapshot() { return this.job ? structuredClone(this.job) : null; }
  publish() { this.onUpdate(this.snapshot()); }
  log(text) {
    if (!text?.trim()) return;
    this.job.logs.push(text.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 8000));
    if (this.job.logs.length > 200) this.job.logs.shift();
    this.publish();
  }
  async start(root, agent, model = '') {
    if (!Object.hasOwn(agentNames, agent)) throw new Error('只支持 Claude 和 Codex');
    if (typeof model !== 'string' || (model && (agent !== 'codex' || !/^[a-zA-Z0-9][a-zA-Z0-9._:[\]-]{0,119}$/.test(model)))) throw new Error('请选择有效的 Codex 模型');
    if (active(this.job?.state)) throw new Error('已有初始化正在执行，请等待完成或停止');
    this.job = { projectPath: root, projectName: path.basename(root), agent, model, state: 'starting', logs: [], missing: [], message: '正在准备初始化', startedAt: new Date().toISOString(), finishedAt: null };
    this.publish();
    try {
      const installed = (await detectAgents(this.env)).find(item => item.id === agent);
      if (!installed.available) throw new Error(`没有检测到 ${agentNames[agent]}，请安装 CLI 后重试`);
      const prompt = await buildPrompt(this.skillRoot);
      if (this.job.state === 'stopping') { this.finish('cancelled', '已停止；已写入的文件会保留'); return this.snapshot(); }
      if (agent === 'codex') {
        const skillDirectory = path.join(root, '.agents');
        await fs.mkdir(skillDirectory, { recursive: true });
        if (await fs.realpath(skillDirectory) !== path.join(await fs.realpath(root), '.agents')) throw new Error('项目 .agents 目录指向外部位置，无法在初始化范围内写入');
      }
      if (this.job.state === 'stopping') { this.finish('cancelled', '已停止；已写入的文件会保留'); return this.snapshot(); }
      const child = spawn(installed.executable, commandArgs(agent, root, model), { cwd: root, env: this.env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child; this.job.state = 'running'; this.job.message = '正在执行初始化'; this.publish();
      let buffer = '', reportedFailure = false, permissionDenied = false, spawnError = '', failureReason = '';
      const consume = line => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          if (event.is_error || event.type === 'turn.failed' || event.type === 'error') reportedFailure = true;
          if (event.permission_denials?.length) permissionDenied = true;
          const detail = event.message || event.error?.message || event.result || '';
          if (/model.*not supported/i.test(detail)) failureReason = '本机 CLI 配置的模型不可用，请在面板选择本机 CLI 提供的模型后重试';
          else if (/authentication|required.*login|not logged in/i.test(detail)) failureReason = '本机 CLI 登录不可用，请先在终端登录后重试';
          for (const text of parseEvent(agent, event)) this.log(text);
          if (event.permission_denials?.length) this.log('部分操作未获本机 Agent 许可，权限限制已保留；完成情况以最终结果和入口检查为准');
        } catch { this.log(line); }
      };
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk;
        let boundary;
        while ((boundary = buffer.indexOf('\n')) !== -1) { consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1); }
        if (buffer.length > 1024 * 1024) { buffer = ''; this.log('一条过长的输出已省略'); }
      });
      child.stderr.on('data', chunk => this.log(chunk));
      child.on('error', error => { spawnError = error.message; });
      child.stdin.on('error', error => this.log(`提示词发送失败：${error.message}`));
      child.on('close', async (code, signal) => {
        consume(buffer); this.child = null;
        if (this.job.state === 'stopping') {
          // Keep the job active until the process-group escalation has run.
          setTimeout(() => this.finish('cancelled', '已停止；已写入的文件会保留'), 2100);
          return;
        }
        if (spawnError || code !== 0 || reportedFailure) { this.finish('failed', spawnError || failureReason || `Agent 未完成初始化（退出码 ${code ?? signal}），请查看执行输出`); return; }
        this.job.state = 'checking'; this.job.message = '正在检查生成的入口文件'; this.publish();
        try {
          this.job.missing = await checkOutputs(root);
          this.finish(this.job.missing.length ? 'failed' : 'completed', this.job.missing.length ? 'Agent 已退出，但初始化入口不完整' : permissionDenied ? '初始化入口已生成；部分操作未获许可，请核对生成内容' : '初始化执行完成，已检查必要入口文件');
        } catch (error) { this.finish('failed', error.message); }
      });
      child.stdin.end(prompt);
    } catch (error) { this.finish('failed', error.message); }
    return this.snapshot();
  }
  finish(state, message) { this.job.state = state; this.job.message = message; this.job.finishedAt = new Date().toISOString(); this.publish(); }
  stop() {
    if (!active(this.job?.state) || ['checking', 'stopping'].includes(this.job.state)) return this.snapshot();
    this.job.state = 'stopping'; this.job.message = '正在停止'; this.publish();
    const child = this.child;
    if (child?.pid) {
      const kill = signal => { try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch {} };
      kill('SIGTERM');
      const timer = setTimeout(() => kill('SIGKILL'), 2000); timer.unref();
    }
    return this.snapshot();
  }
}
module.exports = { AgentRunner, detectAgents, cliEnvironment, commandArgs, buildPrompt, parseEvent, checkOutputs, requiredFiles, active };
