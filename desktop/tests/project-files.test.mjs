import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import files from '../electron/project-files.cjs'
test('classifies agent rules, logs and design without moving documents', () => {
  assert.equal(files.categoryFor('packages/ui/CLAUDE.md'), 'claude')
  assert.equal(files.categoryFor('AGENTS.md'), 'agents')
  assert.equal(files.categoryFor('project-memory/工作记录/2026/09/a.md'), 'logs')
  assert.equal(files.categoryFor('openspec/changes/x/design.md'), 'design')
  assert.equal(files.categoryFor('openspec/changes/x/tasks.md'), 'tasks')
})
test('extracts a source-based synopsis, excluding frontmatter and code', () => {
  const result = files.describe('---\ntitle: hidden\n---\n# 真正标题\n\n正文 **说明** 与 [链接](https://example.org)。\n```js\nsecret code\n```', 'a.md')
  assert.equal(result.title, '真正标题')
  assert.equal(result.excerpt, '正文 说明 与 链接。')
})
test('scans real project files, skips dependencies and symlinks, refreshes changes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'project-desktop-'))
  const external = await mkdtemp(path.join(tmpdir(), 'project-external-'))
  try {
    await mkdir(path.join(root, 'module')); await mkdir(path.join(root, 'node_modules')); await mkdir(path.join(root, '.git'))
    await writeFile(path.join(root, 'CLAUDE.md'), '# Rules\nFirst version')
    await writeFile(path.join(root, 'module', 'CLAUDE.md'), '# Nested\nModule rules')
    await writeFile(path.join(root, 'node_modules', 'README.md'), 'ignored')
    await writeFile(path.join(external, 'private.md'), 'outside')
    await symlink(external, path.join(root, 'linked')); await symlink(path.join(external, 'private.md'), path.join(root, 'linked.md'))
    const first = await files.scanProject(root)
    assert.equal(first.project.path, root)
    assert.deepEqual(first.files.map(f => f.path).sort(), ['CLAUDE.md', 'module/CLAUDE.md'])
    await writeFile(path.join(root, 'CLAUDE.md'), '# Rules\nUpdated version')
    const second = await files.scanProject(root)
    assert.equal(second.files.find(f => f.path === 'CLAUDE.md').excerpt, 'Updated version')
    assert.equal(second.warnings.length, 0)
  } finally { await rm(root, { recursive: true, force: true }); await rm(external, { recursive: true, force: true }) }
})

test('edits UTF-8 Markdown, text and dotfiles, preserving literal text and refusing conflicts and unsafe paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'editable-text-'))
  const external = await mkdtemp(path.join(tmpdir(), 'external-text-'))
  try {
    await mkdir(path.join(root, '.claude'))
    for (const name of ['note.md', 'note.txt', '.gitignore', '.env', '.claude/rules.md']) await writeFile(path.join(root, name), '# 原文\r\n中文')
    await writeFile(path.join(root, '.binary'), Buffer.from([0, 255, 0]))
    const scan = await files.scanProject(root)
    assert.equal(scan.files.length, 5)
    assert.equal(scan.files.find(f => f.path === 'note.txt').title, 'note.txt')
    for (const file of scan.files) {
      const updated = await files.saveFile(root, file.path, '短', file.content)
      assert.equal(updated.content, '短')
      assert.equal(await readFile(path.join(root, file.path), 'utf8'), '短')
      await assert.rejects(files.saveFile(root, file.path, '覆盖', file.content), /其他程序修改/)
      assert.equal(await readFile(path.join(root, file.path), 'utf8'), '短')
    }
    await writeFile(path.join(external, 'outside.txt'), 'outside')
    await symlink(external, path.join(root, 'linked'))
    await symlink(path.join(external, 'outside.txt'), path.join(root, '.linked'))
    for (const relative of ['../outside.txt', '/outside.txt', 'linked/outside.txt', '.linked', '.git/config', 'note.js']) await assert.rejects(files.saveFile(root, relative, 'changed', 'outside'))
    assert.equal(await readFile(path.join(external, 'outside.txt'), 'utf8'), 'outside')
    await assert.rejects(files.saveFile(root, '.binary', 'text', '' ))
    await files.saveFile(root, 'note.txt', '', '短')
    assert.equal(await readFile(path.join(root, 'note.txt'), 'utf8'), '')
  } finally { await rm(root, { recursive:true, force:true }); await rm(external, { recursive:true, force:true }) }
})
