<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import WatermarkOverlay from '../../../packages/watermark-vue/src/WatermarkOverlay.vue'
import { isWatermarkLease, type WatermarkLease } from '../../../packages/watermark-core/src/index'

type User = { alias: string; role: string; tenantId: string }
type Report = { title: string; rows: { label: string; value: string }[] }

const identities = [
  { key: 'qinghe', alias: '青禾', detail: '甲租户 · 员工' },
  { key: 'haitang', alias: '海棠', detail: '乙租户 · 员工' },
  { key: 'auditor', alias: '审计员甲', detail: '甲租户 · 调查员' },
  { key: 'visitor', alias: '访客', detail: '甲租户 · 无报表权限' },
]

const selectedIdentity = ref('qinghe')
const user = ref<User | null>(null)
const report = ref<Report | null>(null)
const lease = ref<WatermarkLease | null>(null)
const status = ref('')
const busy = ref(false)
const codeInput = ref('')
const caseId = ref('CASE-DEMO-001')
const match = ref<Record<string, string> | null>(null)
let generation = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function stopRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
}

function clearProtectedView() {
  stopRefresh()
  report.value = null
  lease.value = null
}

async function requestJson(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options })
  const body = await response.json()
  if (!response.ok) throw new Error(body?.error?.message ?? `请求失败（${response.status}）`)
  return body
}

async function loadReport() {
  const thisGeneration = ++generation
  clearProtectedView()
  busy.value = true
  status.value = ''
  try {
    const body = await requestJson('/api/protected/report/view')
    if (thisGeneration !== generation) return
    if (!isWatermarkLease(body.watermark) || Date.parse(body.watermark.expiresAt) <= Date.now()) {
      throw new Error('服务端返回的水印标识无效')
    }
    report.value = body.content as Report
    lease.value = body.watermark
    const delay = Math.max(1000, Math.min(240_000, Date.parse(body.watermark.expiresAt) - Date.now() - 30_000))
    refreshTimer = setTimeout(() => { void loadReport() }, delay)
  } catch (error) {
    if (thisGeneration !== generation) return
    clearProtectedView()
    status.value = error instanceof Error ? error.message : '报表加载失败'
  } finally {
    if (thisGeneration === generation) busy.value = false
  }
}

async function login() {
  ++generation
  clearProtectedView()
  match.value = null
  user.value = null
  busy.value = true
  status.value = ''
  try {
    const body = await requestJson('/api/demo/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey: selectedIdentity.value }),
    })
    user.value = body.user as User
    if (user.value?.role === 'employee') await loadReport()
  } catch (error) {
    status.value = error instanceof Error ? error.message : '登录失败'
  } finally {
    busy.value = false
  }
}

async function logout() {
  ++generation
  clearProtectedView()
  match.value = null
  user.value = null
  status.value = ''
  try { await requestJson('/api/demo/logout', { method: 'POST' }) }
  catch { status.value = '会话清理失败，请刷新页面确认状态' }
}

async function verify() {
  match.value = null
  status.value = ''
  busy.value = true
  try {
    const body = await requestJson('/api/watermark/v1/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeInput.value.trim(), caseId: caseId.value.trim() }),
    })
    match.value = body.match as Record<string, string>
  } catch (error) {
    status.value = error instanceof Error ? error.message : '核验失败'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    const body = await requestJson('/api/demo/me')
    user.value = body.user as User
    if (user.value?.role === 'employee') await loadReport()
  } catch { /* 无演示会话时展示身份选择 */ }
})
onBeforeUnmount(() => { ++generation; clearProtectedView() })
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">澄</span><span>澄明 <small>WATERMARK LAB</small></span></div>
      <div class="topbar-right"><span class="environment">本地演示环境</span><span class="topbar-dot"></span><span>数据安全实验台</span></div>
    </header>

    <main class="main-content">
      <section class="hero">
        <div class="eyebrow">ENTERPRISE DATA TRACEABILITY <span> / 01</span></div>
        <h1>让每一次查看，<br /><em>都有迹可循。</em></h1>
        <p>服务端完成权限校验并签发追溯码，Vue 页面呈现水印。下方可切换虚构身份，验证签发、隔离与核验流程。</p>
        <div class="hero-rule"><span>01 签发</span><span>02 呈现</span><span>03 核验</span></div>
      </section>

      <section class="workspace">
        <div class="section-head"><div><span class="section-kicker">WORKSPACE</span><h2>验证工作区</h2></div><span class="stage-badge">S1 · 最小闭环</span></div>

        <div v-if="!user" class="panel login-panel">
          <div class="panel-heading"><span class="panel-index">01 / 身份</span><h3>选择演示身份</h3><p>这些身份仅用于本地测试，不能作为生产认证。</p></div>
          <div class="identity-grid">
            <label v-for="identity in identities" :key="identity.key" class="identity-option" :class="{ selected: selectedIdentity === identity.key }">
              <input v-model="selectedIdentity" type="radio" name="identity" :value="identity.key" />
              <span class="identity-avatar">{{ identity.alias.slice(0, 1) }}</span>
              <span><strong>{{ identity.alias }}</strong><small>{{ identity.detail }}</small></span>
              <span class="radio-indicator"></span>
            </label>
          </div>
          <button class="primary-button" type="button" :disabled="busy" @click="login">进入演示工作区 <span>↗</span></button>
        </div>

        <template v-else>
          <div class="session-bar"><div><span class="session-pulse"></span>当前身份 <strong>{{ user.alias }}</strong><small>{{ user.tenantId }} / {{ user.role }}</small></div><button type="button" class="text-button" @click="logout">退出并切换身份 ↗</button></div>

          <div v-if="user.role === 'employee'" class="panel report-panel">
            <div class="panel-heading"><span class="panel-index">02 / 受保护内容</span><h3>{{ report?.title ?? '正在读取报表' }}</h3><p>内容与水印由同一次授权请求返回。签发失败时不会展示报表。</p></div>
            <div v-if="report" class="stat-grid"><div v-for="row in report.rows" :key="row.label" class="stat-card"><span>{{ row.label }}</span><strong>{{ row.value }}</strong><small>虚构演示数据</small></div></div>
            <div v-if="lease" class="lease-note"><span class="lease-icon">✓</span><div><strong>水印已签发</strong><small>追溯码 {{ lease.code }} · {{ lease.policyVersion }}</small></div><button type="button" class="text-button" :disabled="busy" @click="loadReport">重新签发 ↗</button></div>
            <button v-if="!report" class="secondary-button" type="button" :disabled="busy" @click="loadReport">{{ busy ? '加载中…' : '重试加载' }}</button>
          </div>

          <div v-else-if="user.role === 'investigator'" class="panel verify-panel">
            <div class="panel-heading"><span class="panel-index">03 / 安全调查</span><h3>追溯码核验</h3><p>输入甲租户签发的追溯码。乙租户码与不存在的码对外都显示未找到。</p></div>
            <form class="verify-form" @submit.prevent="verify"><label>案件编号<input v-model="caseId" autocomplete="off" placeholder="CASE-DEMO-001" /></label><label>追溯码<input v-model="codeInput" autocomplete="off" placeholder="ABCD-EFGH-JKLM-NPQR-STUV" /></label><button class="primary-button" type="submit" :disabled="busy">{{ busy ? '核验中…' : '查询签发记录' }} <span>↗</span></button></form>
            <div v-if="match" class="match-result"><span class="result-kicker">MATCH FOUND · 调查线索</span><dl><div v-for="(value, key) in match" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div></dl><p>该结果只证明追溯码曾被签发，不能仅凭截图自动定责。</p></div>
          </div>

          <div v-else class="panel access-panel"><span class="panel-index">权限验证</span><h3>当前身份没有报表访问权限</h3><p>可切换为员工或调查员，分别检查受保护内容与核验流程。</p><button class="secondary-button" type="button" :disabled="busy" @click="loadReport">尝试访问报表</button></div>
        </template>

        <p v-if="status" class="status-message" role="alert">{{ status }}</p>
      </section>

      <footer class="footer"><span>澄明 / 水印项目实验台</span><span>仅含虚构数据 · S1</span></footer>
    </main>
    <WatermarkOverlay :lease="lease" />
  </div>
</template>
