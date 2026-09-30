<script setup>
import { computed, ref } from 'vue'
import { ArrowLeft, Terminal, CheckCircle2, CircleAlert, RefreshCw, Square, Play, FolderOpen } from '@lucide/vue'
const props = defineProps({ project: Object, agents: Array, job: Object, detecting: Boolean, busy: Boolean })
const emit = defineEmits(['close', 'start', 'stop', 'detect'])
const choice = defineModel({ default: 'claude' })
const matchingJob = computed(() => props.job?.projectPath === props.project?.path ? props.job : null)
const available = computed(() => props.agents?.find(a => a.id === choice.value)?.available)
const codexModels = computed(() => props.agents?.find(a => a.id === 'codex')?.models || [])
const selectedModel = ref(null)
const model = computed({ get: () => selectedModel.value ?? codexModels.value[0]?.id ?? '', set: value => { selectedModel.value = value } })
const statusLabels = { starting: '准备中', running: '执行中', stopping: '正在停止', checking: '检查结果', completed: '执行完成', failed: '未完成', cancelled: '已停止' }
</script>

<template>
  <section class="init-page">
    <div class="detail-toolbar"><button class="plain-button" @click="emit('close')"><ArrowLeft :size="16" /> 返回文件浏览</button><span>项目初始化</span></div>
    <header class="init-header"><div class="eyebrow">建立可以接续的项目上下文</div><h1>一键初始化</h1><p>让本机 Agent 阅读项目，整理文档入口与开发上下文。</p></header>
    <div class="init-project"><FolderOpen :size="19" /><div><strong>{{ project.name }}</strong><small>{{ project.path }}</small></div></div>
    <div class="init-section-heading"><h2>选择本机 Agent</h2><button class="plain-button" :disabled="detecting || busy" @click="emit('detect')"><RefreshCw :size="13" :class="{ spinning: detecting }" /> {{ detecting ? '检测中' : '重新检测' }}</button></div>
    <div class="agent-options" role="radiogroup" aria-label="初始化 Agent">
      <label v-for="agent in agents" :key="agent.id" class="agent-option" :class="{ chosen: choice === agent.id, unavailable: !agent.available }"><input v-model="choice" type="radio" name="agent" :value="agent.id" :disabled="!agent.available || busy" /><span class="agent-avatar"><Terminal :size="22" /></span><span class="agent-description"><strong>{{ agent.name }}</strong><small>{{ agent.available ? agent.version : '未检测到本地 CLI' }}</small></span><span class="agent-badge" :class="{ installed: agent.available }">{{ agent.available ? '已安装' : '不可用' }}</span></label>
      <div v-if="!agents.length" class="agent-loading">{{ detecting ? '正在检测 Claude 和 Codex…' : '暂时无法检测本机 Agent，请重新检测。' }}</div>
    </div>
    <div v-if="choice === 'codex'" class="init-model"><label for="init-model">本次使用的模型</label><select id="init-model" v-model="model" :disabled="busy || detecting"><option v-for="item in codexModels" :key="item.id" :value="item.id">{{ item.name }}</option><option value="">沿用本机 CLI 默认模型</option></select><small>候选来自本机 CLI，实际可用性取决于账号。选择仅作用于本次初始化。</small></div>
    <div class="init-scope"><h3>这次会做什么</h3><ul><li>阅读现有项目，生成或补齐项目概览、开发约定、文档索引和工作记录。</li><li>建立 AGENTS.md、CLAUDE.md 和项目本地 Skill 入口，保留已有规则和资料。</li></ul><p>使用所选 CLI 已有登录；Claude 沿用本机模型，Codex 可选择本次模型。点击开始后会在上述项目目录写入文档；不会自动提交或发布。</p><p v-if="agents.some(a => !a.available)">未安装的 Agent 请先在终端安装 CLI；已安装但未登录时，先运行 <code>claude</code> 或 <code>codex login</code> 完成登录。</p></div>
    <div v-if="busy && !matchingJob" class="notice">{{ job.projectName }} 的初始化正在执行。你可以继续浏览，或切换回该项目查看进度。</div>
    <div class="init-actions"><button v-if="matchingJob && busy" class="stop-button" :disabled="['stopping', 'checking'].includes(matchingJob.state)" @click="emit('stop')"><Square :size="14" /> 停止执行</button><button v-else class="primary" :disabled="!available || busy || detecting" @click="emit('start', choice, choice === 'codex' ? model : '')"><Play :size="15" /> {{ matchingJob ? '重新执行初始化' : '开始初始化' }}</button><span>已有完整内容会保留，缺失内容会补齐</span></div>
    <section v-if="matchingJob" class="execution" aria-label="初始化执行状态"><div class="execution-heading"><div><CheckCircle2 v-if="matchingJob.state === 'completed'" :size="17" class="success-icon" /><CircleAlert v-else-if="matchingJob.state === 'failed'" :size="17" class="failure-icon" /><RefreshCw v-else :size="17" :class="{ spinning: busy }" /><strong>{{ statusLabels[matchingJob.state] }}</strong></div><small>{{ matchingJob.agent === 'claude' ? 'Claude Code' : 'Codex' }}</small></div><p class="execution-message" role="status">{{ matchingJob.message }}</p><p v-if="matchingJob.state === 'cancelled'" class="scan-note">停止不会撤销 Agent 已经写入的文件，文件列表已刷新。</p><div v-if="matchingJob.missing.length" class="missing-files"><strong>缺少以下入口</strong><div v-for="file in matchingJob.missing" :key="file">{{ file }}</div></div><div class="execution-log" role="log" aria-label="Agent 执行输出"><p v-if="!matchingJob.logs.length">等待 Agent 输出…</p><p v-for="(line, index) in matchingJob.logs" :key="index">{{ line }}</p></div><p class="execution-foot">输出仅保留在本次应用会话中。完成后仍可打开生成的文件检查内容。</p></section>
  </section>
</template>
