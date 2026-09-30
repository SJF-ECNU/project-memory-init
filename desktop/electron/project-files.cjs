const fs = require('node:fs/promises');
const path = require('node:path');
const categories = [
  { id: 'overview', label: '项目概览', icon: 'overview' },
  { id: 'claude', label: 'CLAUDE.md', icon: 'rules' },
  { id: 'agents', label: 'AGENTS.md', icon: 'rules' },
  { id: 'gemini', label: 'GEMINI.md', icon: 'rules' },
  { id: 'logs', label: '开发日志', icon: 'logs' },
  { id: 'design', label: '设计方案', icon: 'design' },
  { id: 'tasks', label: '需求与任务', icon: 'tasks' },
  { id: 'decisions', label: '关键决策', icon: 'decisions' },
  { id: 'environment', label: '环境与部署', icon: 'environment' },
  { id: 'guides', label: '使用指南', icon: 'guides' },
  { id: 'other', label: '其他文档', icon: 'other' },
];
function categoryFor(relative) {
  const name = path.basename(relative).toLowerCase();
  if (name === 'claude.md') return 'claude';
  if (name === 'agents.md' || name === 'agent.md') return 'agents';
  if (name === 'gemini.md') return 'gemini';
  if (/工作记录|开发日志|worklogs?|changelog|(^|\/)logs?\//i.test(relative)) return 'logs';
  if (/决策|decisions?|(^|\/)adr\//i.test(relative)) return 'decisions';
  if (/环境|部署|运维|deploy|environment|runbook/i.test(relative)) return 'environment';
  if (/设计|架构|design|architecture/i.test(relative)) return 'design';
  if (/openspec|需求|任务|工作流|tasks?|requirements?/i.test(relative)) return 'tasks';
  if (/readme|首页|概览|背景/i.test(name)) return 'overview';
  if (/使用|安装|指南|协议|规范|guide|skill\.md/i.test(relative)) return 'guides';
  return 'other';
}
function describe(content, filename) {
  const body = content.replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const title = body.match(/^#\s+(.+)$/m)?.[1].trim() || filename;
  const excerpt = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
    .replace(/^#{1,6}\s+.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/^[\s>*|#-]+/gm, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  return { title, excerpt: excerpt.length > 180 ? excerpt.slice(0, 180) + '…' : excerpt || '暂无正文概要' };
}
const excluded = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'target', '.git', '.obsidian', '.codegraph']);
function supported(name) { return /\.(md|txt)$/i.test(name) || path.basename(name).startsWith('.'); }
function decode(data) { const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data); if (text.includes('\0')) throw new Error('二进制文件不支持编辑'); return text; }
async function scanProject(root) {
  const realRoot = await fs.realpath(root);
  const files = [], warnings = [];
  async function walk(directory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch { warnings.push(path.relative(realRoot, directory) || '.'); return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || excluded.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(absolute); continue; }
      if (!entry.isFile() || !supported(entry.name)) continue;
      try {
        const handle = await fs.open(absolute, require('node:fs').constants.O_RDONLY | require('node:fs').constants.O_NOFOLLOW);
        try {
          const stat = await handle.stat();
          if (stat.size > 2 * 1024 * 1024) { warnings.push(path.relative(realRoot, absolute)); continue; }
          const content = decode(await handle.readFile());
          const relative = path.relative(realRoot, absolute).split(path.sep).join('/');
          files.push({ path: relative, name: entry.name, category: categoryFor(relative), modifiedAt: stat.mtime.toISOString(), content, ...( !/\.md$/i.test(entry.name) ? { title: entry.name, excerpt: content.trim().slice(0, 180) || '暂无正文概要' } : describe(content, entry.name)) });
        } finally { await handle.close(); }
      } catch { warnings.push(path.relative(realRoot, absolute)); }
    }
  }
  await walk(realRoot);
  return { project: { path: root, name: path.basename(root) }, files, categories, warnings };
}
async function saveFile(root, relative, content, original) {
  if (typeof relative !== 'string' || typeof content !== 'string' || typeof original !== 'string' || !supported(relative) || content.includes('\0') || Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error('不支持的文件或内容超过 2 MB');
  const parts = relative.split('/');
  if (path.isAbsolute(relative) || parts.some(part => !part || part === '.' || part === '..' || excluded.has(part) || part.includes('\\'))) throw new Error('文件路径不在可编辑范围内');
  const realRoot = await fs.realpath(root);
  let target = realRoot;
  for (const part of parts) {
    target = path.join(target, part);
    if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('不能编辑符号链接');
  }
  if (await fs.realpath(target) !== target) throw new Error('文件路径已变化');
  const constants = require('node:fs').constants;
  const handle = await fs.open(target, constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('不支持的文件');
    const existing = decode(await handle.readFile());
    if (existing !== original) throw new Error('文件已被其他程序修改，请保留草稿并返回刷新后重试');
    const temporary = path.join(path.dirname(target), `.workbench-${require('node:crypto').randomUUID()}.tmp`);
    let output;
    try {
      output = await fs.open(temporary, 'wx', stat.mode & 0o777);
      await output.writeFile(content, 'utf8');
      await output.chmod(stat.mode & 0o777);
      await output.sync();
      await output.close(); output = null;
      if (await fs.realpath(target) !== target || (await fs.lstat(target)).isSymbolicLink()) throw new Error('文件路径已变化');
      if (decode(await fs.readFile(target)) !== original) throw new Error('文件已被其他程序修改，请保留草稿并返回刷新后重试');
      await fs.rename(temporary, target);
    } finally { if (output) await output.close(); await fs.rm(temporary, { force: true }); }
    const updated = await fs.stat(target);
    return { content, modifiedAt: updated.mtime.toISOString(), ...( !/\.md$/i.test(relative) ? { title: path.basename(relative), excerpt: content.trim().slice(0, 180) || '暂无正文概要' } : describe(content, path.basename(relative))) };
  } finally { await handle.close(); }
}
module.exports = { saveFile, scanProject, categoryFor, describe, categories };
