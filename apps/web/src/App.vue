<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import WatermarkOverlay from '../../../packages/watermark-vue/src/WatermarkOverlay.vue'
import { extractCurrentSignal, isWatermarkLease, type ExtractionResult, type WatermarkLease } from '../../../packages/watermark-core/src/index'

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
const extraction = ref<ExtractionResult | null>(null)
const uploadedName = ref('')
let generation = 0
let inspectRequest = 0
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function stopRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
}

function scheduleRefresh(watermark: WatermarkLease) {
  stopRefresh()
  const delay = Math.max(1000, Math.min(240_000, Date.parse(watermark.expiresAt) - Date.now() - 30_000))
  refreshTimer = setTimeout(() => { void refreshWatermark() }, delay)
}

function clearProtectedView() {
  stopRefresh()
  ++inspectRequest
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
  stopRefresh()
  report.value = null
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
    scheduleRefresh(body.watermark)
  } catch (error) {
    if (thisGeneration !== generation) return
    clearProtectedView()
    status.value = error instanceof Error ? error.message : '报表加载失败'
  } finally {
    if (thisGeneration === generation) busy.value = false
  }
}

async function refreshWatermark() {
  const thisGeneration = ++generation
  clearProtectedView()
  try {
    const body = await requestJson('/api/demo/refresh-watermark', { method: 'POST' })
    if (thisGeneration !== generation) return
    if (!isWatermarkLease(body.watermark)) throw new Error('服务端返回的水印图片无效')
    lease.value = body.watermark
    scheduleRefresh(body.watermark)
    extraction.value = null
    if (user.value?.role === 'employee') await loadReport()
  } catch (error) {
    if (thisGeneration === generation) status.value = error instanceof Error ? error.message : '刷新水印失败'
  }
}
async function login() {
  ++generation
  clearProtectedView()
  extraction.value = null
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
    if (!isWatermarkLease(body.watermark)) throw new Error('服务端返回的水印图片无效')
    lease.value = body.watermark
    scheduleRefresh(body.watermark)
    if (user.value?.role === 'employee') await loadReport()
  } catch (error) {
    user.value = null
    clearProtectedView()
    status.value = error instanceof Error ? error.message : '登录失败'
  } finally {
    busy.value = false
  }
}

async function logout() {
  ++generation
  clearProtectedView()
  extraction.value = null
  match.value = null
  user.value = null
  status.value = ''
  try { await requestJson('/api/demo/logout', { method: 'POST' }) }
  catch { status.value = '会话清理失败，请刷新页面确认状态' }
}

async function inspectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  extraction.value = null
  if (!file || !lease.value) return
  const signalId = lease.value.signalId
  const thisInspection = ++inspectRequest
  uploadedName.value = file.name
  status.value = ''
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('仅接受 PNG、JPEG 或 WebP 图片')
    if (file.size > 20 * 1024 * 1024) throw new Error('图片不能超过 20 MiB')
    const bitmap = await createImageBitmap(file)
    if (thisInspection !== inspectRequest || lease.value?.signalId !== signalId) { bitmap.close(); return }
    if (bitmap.width * bitmap.height > 16_000_000) { bitmap.close(); throw new Error('图片像素不能超过 1600 万') }
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) { bitmap.close(); throw new Error('无法读取图片像素') }
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = extractCurrentSignal(pixels.data, canvas.width, canvas.height, signalId)
    if (thisInspection === inspectRequest && lease.value?.signalId === signalId) extraction.value = result
  } catch (error) {
    if (thisInspection === inspectRequest) status.value = error instanceof Error ? error.message : '图片提取失败'
  }
  finally { input.value = '' }
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
    if (!isWatermarkLease(body.watermark)) throw new Error('服务端返回的水印图片无效')
    lease.value = body.watermark
    if (Date.parse(body.watermark.expiresAt) <= Date.now()) await refreshWatermark()
    else if (user.value?.role === 'employee') await loadReport()
    else scheduleRefresh(body.watermark)
  } catch {
    if (user.value) {
      user.value = null
      clearProtectedView()
      status.value = '无法恢复有效水印，请重新登录'
    }
  }
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
            <div v-if="lease" class="lease-note"><span class="lease-icon">✓</span><div><strong>水印已签发</strong><small>追溯码 {{ lease.code }} · {{ lease.policyVersion }}</small></div><button type="button" class="text-button" :disabled="busy" @click="refreshWatermark">重新签发 ↗</button></div>
            <button v-if="!report" class="secondary-button" type="button" :disabled="busy" @click="loadReport">{{ busy ? '加载中…' : '重试加载' }}</button>
          </div>

          <div v-else-if="user.role === 'investigator'" class="panel verify-panel">
            <div class="panel-heading"><span class="panel-index">03 / 安全调查</span><h3>追溯码核验</h3><p>输入甲租户签发的追溯码。乙租户码与不存在的码对外都显示未找到。</p></div>
            <form class="verify-form" @submit.prevent="verify"><label>案件编号<input v-model="caseId" autocomplete="off" placeholder="CASE-DEMO-001" /></label><label>追溯码<input v-model="codeInput" autocomplete="off" placeholder="ABCD-EFGH-JKLM-NPQR-STUV" /></label><button class="primary-button" type="submit" :disabled="busy">{{ busy ? '核验中…' : '查询签发记录' }} <span>↗</span></button></form>
            <div v-if="match" class="match-result"><span class="result-kicker">MATCH FOUND · 调查线索</span><dl><div v-for="(value, key) in match" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></div></dl><p>该结果只证明追溯码曾被签发，不能仅凭截图自动定责。</p></div>
          </div>

          <div v-else class="panel access-panel"><span class="panel-index">权限验证</span><h3>当前身份没有报表访问权限</h3><p>可切换为员工或调查员，分别检查受保护内容与核验流程。</p><button class="secondary-button" type="button" :disabled="busy" @click="loadReport">尝试访问报表</button></div>
        </template>

        <section v-if="lease" class="panel lab-panel">
          <div class="panel-heading"><span class="panel-index">04 / 图片实验台</span><h3>服务端当前水印图片</h3><p>模拟登录返回的原图块；当前自检只比较本次租约，不代表真实泄露调查或平台转发验收。</p></div>
          <img class="watermark-preview" :src="lease.imageDataUrl" width="160" height="160" alt="服务端返回的当前水印图块" />
          <p>图块版本 {{ lease.algorithmVersion }} · 当前码 {{ lease.code }} · 暂定最小截图 640×360 像素</p>
          <label class="upload-label">上传页面原始截图自检 <input type="file" accept="image/png,image/jpeg,image/webp" @change="inspectFile" /></label>
          <p v-if="extraction">{{ uploadedName }}：{{ extraction.status === 'matched' ? '匹配当前水印' : extraction.status === 'uncertain' ? '证据不足' : '未检出' }}；{{ extraction.recoveredSignalId ? `提取标识 ${extraction.recoveredSignalId}；` : '' }}检测分数 {{ extraction.score.toFixed(2) }}，匹配位 {{ extraction.matchingBits }}/64。</p>
        </section>
        <p v-if="status" class="status-message" role="alert">{{ status }}</p>
      </section>

      <footer class="footer"><span>澄明 / 水印项目实验台</span><span>仅含虚构数据 · S1</span></footer>
    </main>
    <WatermarkOverlay :lease="lease" />
  </div>
</template>
