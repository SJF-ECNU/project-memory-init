<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import InitializationPanel from './InitializationPanel.vue'
import { Layers, FolderOpen, Plus, Search, RefreshCw, ArrowLeft, ArrowUpRight, FileText, BookOpen, Clock3, LayoutDashboard, Terminal, ListTodo, Compass, Settings2, ChevronDown, NotebookPen } from '@lucide/vue'
const projects = ref([]), current = ref(null), files = ref([]), categories = ref([])
const category = ref('all'), query = ref(''), sort = ref('updated'), selected = ref(null)
const loading = ref(false), error = ref(''), warnings = ref([]), scroller = ref(null)
const editing = ref(false), draft = ref(''), saving = ref(false), editError = ref('')
const dirty = computed(() => editing.value && draft.value !== selected.value?.content)
const plainText = computed(() => selected.value && !/\.md$/i.test(selected.value.name))
async function leaveEditor() { if (saving.value) return false; if (dirty.value && !await window.projects.discard()) return false; editing.value = false; editError.value = ''; return true }
function edit() { draft.value = selected.value.content; editing.value = true; editError.value = '' }
async function save() {
  if (!dirty.value || saving.value) return
  saving.value = true; editError.value = ''
  try {
    const updated = await window.projects.save(current.value.path, selected.value.path, draft.value, selected.value.content)
    Object.assign(selected.value, updated); editing.value = false
  } catch(e) { editError.value = e.message }
  finally { saving.value = false }
}
function beforeUnload(event) { if (dirty.value || saving.value) { event.preventDefault(); event.returnValue = '' } }
function saveShortcut(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (editing.value) save() } }
const initOpen = ref(false), agents = ref([]), detectingAgents = ref(false), initJob = ref(null), agentChoice = ref('claude')
const initBusy = computed(() => ['starting', 'running', 'stopping', 'checking'].includes(initJob.value?.state))
let unsubscribeInitialization
let scrollPosition = 0, initializationScrollPosition = 0, viewScrollPosition = 0, scanVersion = 0
const icons = { overview: LayoutDashboard, rules: Terminal, logs: Clock3, design: Compass, tasks: ListTodo, decisions: NotebookPen, environment: Settings2, guides: BookOpen, other: FileText }
const visibleCategories = computed(() => categories.value.map(c => ({ ...c, count: files.value.filter(f => f.category === c.id).length })).filter(c => c.count))
const activeLabel = computed(() => category.value === 'all' ? '全部内容' : category.value === 'recent' ? '最近更新' : categories.value.find(c => c.id === category.value)?.label || '全部内容')
const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  let result = files.value.filter(f => (['all', 'recent'].includes(category.value) || f.category === category.value) && (!needle || `${f.title} ${f.path} ${f.content}`.toLowerCase().includes(needle)))
  result.sort(sort.value === 'name' && category.value !== 'recent' ? (a,b) => a.title.localeCompare(b.title, 'zh-CN') : (a,b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path))
  return category.value === 'recent' ? result.slice(0, 20) : result
})
const markdown = computed(() => {
  if (!selected.value) return ''
  const text = selected.value.content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
  return DOMPurify.sanitize(marked.parse(text), { FORBID_TAGS: ['img', 'video', 'audio', 'iframe', 'form', 'input', 'button', 'style'], FORBID_ATTR: ['style'] })
})
const fileGroups = computed(() => {
  if (sort.value === 'name' && category.value !== 'recent') return [{ label: '', files: filtered.value }]
  const now = new Date(), today = new Date(now); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const week = new Date(today); week.setDate(today.getDate() - 6)
  const groups = []
  for (const file of filtered.value) {
    const time = new Date(file.modifiedAt)
    const label = time > now ? '未来日期' : time >= today ? '今天' : time >= yesterday ? '昨天' : time >= week ? '近 7 天' : `更早 · ${time.getFullYear()} 年 ${String(time.getMonth() + 1).padStart(2, '0')} 月`
    let group = groups.find(group => group.label === label)
    if (!group) { group = { label, files: [] }; groups.push(group) }
    group.files.push(file)
  }
  return groups
})
function date(value) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) }
function fullDate(value) { return new Date(value).toLocaleString('zh-CN') }
async function load(project, reset = true) {
  if (reset ? !await leaveEditor() : dirty.value || saving.value) return
  editing.value = false; editError.value = ''
  const version = ++scanVersion
  loading.value = true; error.value = ''; selected.value = null
  if (reset) { viewScrollPosition = 0; initOpen.value = false; category.value = 'all'; query.value = ''; files.value = []; categories.value = []; current.value = project }
  try {
    const data = await window.projects.scan(project.path)
    if (version !== scanVersion) return
    current.value = data.project; files.value = data.files; categories.value = data.categories; warnings.value = data.warnings
    if (!['all', 'recent'].includes(category.value) && !data.files.some(f => f.category === category.value)) category.value = 'all'
    localStorage.setItem('lastProject', project.path)
  } catch (e) { if (version === scanVersion) error.value = e.message }
  finally { if (version === scanVersion) loading.value = false }
}
async function switchProject(event) { await load(projects.value.find(p => p.path === event.target.value)); event.target.value = current.value?.path || '' }
async function detectLocalAgents() {
  detectingAgents.value = true
  try {
    agents.value = await window.initialization.agents()
    if (!agents.value.find(a => a.id === agentChoice.value)?.available) agentChoice.value = agents.value.find(a => a.available)?.id || 'claude'
  } catch (e) { error.value = e.message }
  finally { detectingAgents.value = false }
}
async function openInitialization() { if (!await leaveEditor()) return; if (!initOpen.value) { initializationScrollPosition = scroller.value.scrollTop; viewScrollPosition = 0; scroller.value.scrollTop = 0 }; initOpen.value = true; await detectLocalAgents() }
async function closeInitialization() { viewScrollPosition = initializationScrollPosition; initOpen.value = false; await nextTick(); restoreScroll() }
async function startInitialization(agent, model) {
  try { initJob.value = await window.initialization.start(current.value.path, agent, model) }
  catch (e) { error.value = e.message }
}
async function stopInitialization() {
  try { initJob.value = await window.initialization.stop() }
  catch (e) { error.value = e.message }
}
function receiveInitialization(job) {
  const previous = initJob.value
  initJob.value = job
  if (job.finishedAt && job.finishedAt !== previous?.finishedAt && current.value?.path === job.projectPath) load(current.value, false)
}
onUnmounted(() => { unsubscribeInitialization?.(); window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', saveShortcut) })
async function choose() {
  if (!await leaveEditor()) return
  try {
    const project = await window.projects.choose()
    if (!project) return
    projects.value = await window.projects.list(); await load(project)
  } catch(e) { error.value = e.message }
}
async function switchCategory(id) { if (!await leaveEditor()) return; initOpen.value = false; category.value = id; if (id === 'recent') sort.value = 'updated'; selected.value = null; scrollPosition = 0; viewScrollPosition = 0; if (scroller.value) scroller.value.scrollTop = 0 }
function open(file) { scrollPosition = scroller.value.scrollTop; viewScrollPosition = 0; selected.value = file; scroller.value.scrollTop = 0 }
function restoreScroll() { scroller.value.scrollTop = viewScrollPosition }
async function back() { if (!await leaveEditor()) return; viewScrollPosition = scrollPosition; selected.value = null; await nextTick(); restoreScroll() }
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload); window.addEventListener('keydown', saveShortcut)
  if (!window.projects) { error.value = '请通过桌面应用打开，浏览器预览无法访问本地项目。'; return }
  try {
    unsubscribeInitialization = window.initialization.onUpdate(receiveInitialization)
    initJob.value = await window.initialization.status()
    projects.value = await window.projects.list()
    const last = projects.value.find(p => p.path === localStorage.getItem('lastProject')) || projects.value[0]
    if (last) await load(last)
  } catch(e) { error.value = e.message }
})
</script>

<template>
  <div class="workspace">
    <aside class="sidebar">
      <div class="traffic-space"></div>
      <div class="brand"><span class="brand-symbol"><Layers :size="20" /></span><span>项目工作台<small>把上下文留在项目里</small></span></div>
      <div class="project-picker">
        <FolderOpen :size="18" />
        <select aria-label="切换项目" :value="current?.path || ''" @change="switchProject"><option v-if="!projects.length" value="">选择一个项目</option><option v-for="p in projects" :key="p.path" :value="p.path">{{ p.name }}</option></select>
        <ChevronDown :size="14" />
      </div>
      <button class="add-project" @click="choose"><Plus :size="15" /> 添加本地项目</button>
      <nav aria-label="内容分类">
        <button :class="{ active: category === 'all' }" @click="switchCategory('all')"><Layers :size="17" /><span>全部内容</span><em>{{ files.length }}</em></button>
        <button :class="{ active: category === 'recent' }" @click="switchCategory('recent')"><Clock3 :size="17" /><span>最近更新</span></button>
        <div class="nav-label">内容分类</div>
        <button v-for="c in visibleCategories" :key="c.id" :class="{ active: category === c.id }" @click="switchCategory(c.id)"><component :is="icons[c.icon]" :size="17" /><span>{{ c.label }}</span><em>{{ c.count }}</em></button>
      </nav>
      <div class="sidebar-foot"><span class="local-dot"></span> 本地文件 · 按项目组织<small>内容保留在你的项目目录中</small></div>
    </aside>
    <main ref="scroller" class="main" @keydown.esc="initOpen ? closeInitialization() : selected && back()">
      <div class="window-bar"><span>{{ current?.name || '欢迎使用' }}</span><button v-if="current" class="init-entry" @click="openInitialization"><Terminal :size="14" /> {{ initBusy ? '初始化进行中' : '一键初始化' }}</button><span v-else class="window-note">PROJECT WORKSPACE</span></div>
      <div v-if="error" class="notice" role="alert">{{ error }} <button v-if="current" @click="load(current, false)">重试</button></div>
      <div class="view-stage"><Transition name="view" @after-enter="restoreScroll"><div :key="initOpen ? 'initialization' : selected ? selected.path : 'browse'" class="view-frame">
      <InitializationPanel v-if="initOpen && current" v-model="agentChoice" :project="current" :agents="agents" :job="initJob" :detecting="detectingAgents" :busy="initBusy" @close="closeInitialization" @start="startInitialization" @stop="stopInitialization" @detect="detectLocalAgents" />
      <template v-else-if="selected">
        <div class="detail-toolbar"><button class="plain-button" @click="back"><ArrowLeft :size="16" /> 返回 {{ activeLabel }}</button><div class="editor-actions"><span v-if="editing">{{ dirty ? '未保存' : '未修改' }}</span><template v-if="editing"><button class="plain-button" :disabled="saving" @click="leaveEditor">取消编辑</button><button class="primary" :disabled="!dirty || saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button></template><button v-else class="plain-button" @click="edit">编辑文件</button></div></div>
        <article class="reader"><div class="eyebrow">{{ categories.find(c => c.id === selected.category)?.label }}</div><h1>{{ selected.title }}</h1><div class="reader-meta"><span>{{ selected.path }}</span><span>更新于 {{ fullDate(selected.modifiedAt) }}</span></div><div v-if="editError" class="notice" role="alert">{{ editError }}</div><textarea v-if="editing" v-model="draft" class="file-editor" aria-label="文件内容编辑" spellcheck="false" :readonly="saving"></textarea><pre v-else-if="plainText" class="plain-content">{{ selected.content }}</pre><div v-else class="markdown" v-html="markdown" @click="e => { if (e.target.closest('a')) e.preventDefault() }"></div></article>
      </template>
      <template v-else>
        <div class="browse-chrome"><header class="page-header"><div class="eyebrow">{{ current ? '你的项目，清晰有序' : '从一个项目开始' }}</div><div class="heading-line"><h1>{{ activeLabel }}</h1><span class="file-total">{{ filtered.length }} 篇文档</span></div><p>{{ category === 'recent' ? '最近更新的 20 篇文档，随时接续上次的工作。' : '沿着分类浏览，让每一份记录都更容易找到。' }}</p></header>
        <div class="tools"><label class="search"><Search :size="17" /><input v-model="query" aria-label="搜索项目内容" placeholder="搜索标题、路径或正文…" /><kbd v-if="!query">搜索</kbd><button v-else aria-label="清除搜索" @click="query = ''">×</button></label><select v-model="sort" :disabled="category === 'recent'" aria-label="文件排序"><option value="updated">最近更新</option><option value="name">名称排序</option></select><button class="refresh" :disabled="!current || loading" aria-label="刷新项目" @click="load(current, false)"><RefreshCw :size="16" :class="{ spinning: loading }" /></button></div>
        </div>
        <div class="results-stage"><Transition name="results"><div :key="`${current?.path}:${category}`" class="file-results">
        <div v-if="warnings.length" class="scan-note">{{ warnings.length }} 个路径无法读取或超过 2 MB，已跳过。<details><summary>查看路径</summary><div v-for="item in warnings" :key="item">{{ item }}</div></details></div>
        <div v-if="loading" class="empty"><RefreshCw class="spinning" :size="28" /><h2>正在读取项目内容</h2><p>从本地文件建立分类和概要</p></div>
        <div v-else-if="!current" class="empty welcome"><span class="welcome-icon"><FolderOpen :size="32" /></span><h2>给项目一个清晰的工作空间</h2><p>选择本地项目目录，浏览规则、设计和开发记录。<br />无需导入，也不会移动你的文件。</p><button class="primary" @click="choose"><Plus :size="17" /> 选择项目目录</button></div>
        <div v-else-if="!filtered.length" class="empty"><Search :size="28" /><h2>{{ query ? '没有找到相关内容' : '这里还没有可浏览的文本文件' }}</h2><p>{{ query ? '试试其他关键词，或切换到全部内容。' : '添加文档后，点击刷新即可看到。' }}</p><button v-if="query" class="plain-button" @click="query = ''">清除搜索</button></div>
        <div v-else class="file-groups"><section v-for="group in fileGroups" :key="group.label" class="time-group"><h2 v-if="group.label" class="time-group-heading"><Clock3 :size="15" /><span>{{ group.label }}</span><small>{{ group.files.length }} 篇</small><i></i></h2><div class="masonry">
          <div v-for="file in group.files" :key="file.path" class="file-item">
            <button class="file-card" @click="open(file)"><div class="card-top"><span class="file-icon"><component :is="icons[categories.find(c => c.id === file.category)?.icon] || FileText" :size="19" /></span><span class="card-category">{{ categories.find(c => c.id === file.category)?.label }}</span><ArrowUpRight class="open-arrow" :size="17" /></div><h2>{{ file.title }}</h2><div class="file-path" :title="file.path">{{ file.path }}</div><p>{{ file.excerpt }}</p><div class="card-bottom"><span>{{ /\.md$/i.test(file.name) ? 'Markdown' : '纯文本' }}</span><span>{{ Math.max(1, Math.ceil(file.content.length / 600)) }} 分钟阅读</span></div></button>
            <div class="card-date"><Clock3 :size="12" /><time :datetime="file.modifiedAt" :title="fullDate(file.modifiedAt)">更新于 {{ date(file.modifiedAt) }}</time></div>
          </div>
        </div>
        </section></div>
        <footer v-if="current && !loading" class="content-foot"><span></span>概要提取自文件正文<span></span></footer>
        </div></Transition></div>
      </template>
      </div></Transition></div>
    </main>
  </div>
</template>
