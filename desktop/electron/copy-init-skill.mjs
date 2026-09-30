import { cp, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const destination = fileURLToPath(new URL('../dist/initializer/', import.meta.url))
await mkdir(destination, { recursive: true })
for (const name of ['SKILL.md', 'references', 'assets']) await cp(root + name, destination + name, { recursive: true })
console.log('初始化 Skill 与模板已随构建携带')
