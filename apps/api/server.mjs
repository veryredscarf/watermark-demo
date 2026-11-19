import { createServer } from 'node:http'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { openStorage } from './storage.mjs'
import { createWatermarkImage } from './watermark-image.mjs'

const USERS = Object.freeze({
  qinghe: { id: 'u-a-01', alias: '青禾', role: 'employee', tenantId: 'alpha' },
  haitang: { id: 'u-b-01', alias: '海棠', role: 'employee', tenantId: 'beta' },
  auditor: { id: 'u-a-02', alias: '审计员甲', role: 'investigator', tenantId: 'alpha' },
  visitor: { id: 'u-a-03', alias: '访客', role: 'visitor', tenantId: 'alpha' },
})

const REPORTS = Object.freeze({
  alpha: { title: '经营概览 · 甲租户', rows: [
    { label: '季度订单', value: '1,248' },
    { label: '活跃客户', value: '386' },
    { label: '待处理事项', value: '17' },
  ] },
  beta: { title: '经营概览 · 乙租户', rows: [
    { label: '季度订单', value: '852' },
    { label: '活跃客户', value: '241' },
    { label: '待处理事项', value: '9' },
  ] },
})

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const COOKIE_NAME = 'wm_demo_sid'
const SESSION_MS = 60 * 60 * 1000
const LEASE_MS = 5 * 60 * 1000

function encodeBase32(bytes) {
  let buffer = 0
  let bits = 0
  let result = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result += ALPHABET[(buffer >>> bits) & 31]
    }
    buffer &= (1 << bits) - 1
  }
  if (bits > 0) result += ALPHABET[(buffer << (5 - bits)) & 31]
  return result
}

function formatCode(raw) {
  return raw.match(/.{1,4}/g).join('-')
}

function normalizeCode(value) {
  if (typeof value !== 'string') return null
  const raw = value.toUpperCase().replaceAll('-', '')
  return /^[A-Z2-7]{20}$/.test(raw) ? raw : null
}

function parseCookie(header = '') {
  const pair = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))
  return pair?.slice(COOKIE_NAME.length + 1) ?? null
}

async function readJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 2048) throw Object.assign(new Error('请求体过大'), { status: 413, code: 'BODY_TOO_LARGE' })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('JSON 格式无效'), { status: 400, code: 'INVALID_JSON' })
  }
}

export function createApiServer({ now = () => Date.now(), signingAvailable = () => true, webOrigin = 'http://localhost:5173', dbPath = resolve('artifacts/runtime/watermark.sqlite') } = {}) {
  const db = openStorage(dbPath)
  db.exec('CREATE TABLE IF NOT EXISTS leases (raw TEXT PRIMARY KEY, signal_id TEXT UNIQUE NOT NULL, tenant_id TEXT NOT NULL, subject_id TEXT NOT NULL, alias TEXT NOT NULL, resource_id TEXT NOT NULL, access_event_id TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL)')
  const sessions = new Map()
  const audit = []
  const verifyAttempts = new Map()

  function record(type, detail) {
    const event = { type, at: new Date(now()).toISOString(), ...detail }
    db.prepare('INSERT INTO audit_events (id, type, at, detail) VALUES (?, ?, ?, ?)').run(randomUUID(), type, event.at, JSON.stringify(detail))
    audit.push(event)
  }

  function issueWatermark(user, resourceId = 'list-pages') {
    if (!signingAvailable()) throw Object.assign(new Error('水印服务暂不可用'), { status: 503, code: 'SIGNING_UNAVAILABLE' })
    const raw = encodeBase32(randomBytes(12))
    const signalId = randomBytes(8).toString('hex')
    const issuedAt = new Date(now()).toISOString()
    const expiresAt = new Date(now() + LEASE_MS).toISOString()
    const accessEventId = randomUUID()
    const code = formatCode(raw)
    const image = createWatermarkImage({ signalId, code, alias: user.alias })
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO leases (raw, signal_id, tenant_id, subject_id, alias, resource_id, access_event_id, issued_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(raw, signalId, user.tenantId, user.id, user.alias, resourceId, accessEventId, issuedAt, expiresAt)
      db.prepare('INSERT INTO audit_events (id, type, at, detail) VALUES (?, ?, ?, ?)').run(randomUUID(), 'lease_issued', issuedAt, JSON.stringify({ accessEventId, codeHash: createHash('sha256').update(raw).digest('hex') }))
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
    return { code, issuedAt, expiresAt, displayText: `内部资料 · ${user.alias}`, policyVersion: 'lab-v1', layout: { density: 'standard', opacity: 0.05 }, ...image }
  }
  function send(res, status, data, requestId, extraHeaders = {}) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Request-Id': requestId,
      ...extraHeaders,
    })
    res.end(JSON.stringify(data))
  }

  function fail(res, status, code, message, requestId) {
    send(res, status, { error: { code, message }, requestId }, requestId)
  }

  function sessionFor(req) {
    const sid = parseCookie(req.headers.cookie)
    const session = sid && sessions.get(sid)
    if (!session) return null
    if (session.expiresAt <= now()) {
      sessions.delete(sid)
      return null
    }
    return { sid, ...session }
  }

  const server = createServer(async (req, res) => {
    const requestId = randomUUID()
    const pathname = new URL(req.url, 'http://localhost').pathname
    try {
      if (req.method === 'POST' && req.headers.origin !== webOrigin) {
        return fail(res, 403, 'INVALID_ORIGIN', '请求来源无效', requestId)
      }

      if (req.method === 'POST' && pathname === '/api/demo/login') {
        const body = await readJson(req)
        const user = USERS[body?.userKey]
        if (!user) return fail(res, 400, 'UNKNOWN_DEMO_USER', '演示身份无效', requestId)
        const watermark = issueWatermark(user)
        const sid = randomBytes(32).toString('hex')
        sessions.set(sid, { user, watermark, expiresAt: now() + SESSION_MS })
        record('login', { requestId, subjectId: user.id, tenantId: user.tenantId })
        return send(res, 200, { user: { alias: user.alias, role: user.role, tenantId: user.tenantId }, watermark }, requestId, {
          'Set-Cookie': `${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600`,
        })
      }

      const session = sessionFor(req)
      if (!session) return fail(res, 401, 'UNAUTHENTICATED', '请先登录', requestId)
      const { user } = session

      if (req.method === 'POST' && pathname === '/api/demo/logout') {
        sessions.delete(session.sid)
        record('logout', { requestId, subjectId: user.id, tenantId: user.tenantId })
        return send(res, 200, { ok: true }, requestId, {
          'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`,
        })
      }

      if (req.method === 'GET' && pathname === '/api/demo/me') {
        return send(res, 200, { user: { alias: user.alias, role: user.role, tenantId: user.tenantId }, watermark: session.watermark }, requestId)
      }

      if (req.method === 'GET' && pathname === '/api/protected/report/view') {
        if (user.role !== 'employee' || !REPORTS[user.tenantId]) {
          record('access_denied', { requestId, subjectId: user.id, tenantId: user.tenantId, resourceId: 'report' })
          return fail(res, 403, 'FORBIDDEN', '没有访问权限', requestId)
        }
        if (Date.parse(session.watermark.expiresAt) <= now()) return fail(res, 409, 'WATERMARK_EXPIRED', '水印已过期，请刷新', requestId)
        record('access_granted', { requestId, subjectId: user.id, tenantId: user.tenantId, resourceId: 'report' })
        return send(res, 200, {
          content: REPORTS[user.tenantId],
          watermark: session.watermark,
        }, requestId)
      }

      if (req.method === 'POST' && pathname === '/api/demo/refresh-watermark') {
        const watermark = issueWatermark(user)
        sessions.set(session.sid, { user, watermark, expiresAt: session.expiresAt })
        return send(res, 200, { watermark }, requestId)
      }
      if (req.method === 'POST' && pathname === '/api/watermark/v1/verify') {
        if (user.role !== 'investigator') {
          record('verify_denied', { requestId, subjectId: user.id, tenantId: user.tenantId })
          return fail(res, 403, 'FORBIDDEN', '没有核验权限', requestId)
        }
        const key = user.id
        const recent = (verifyAttempts.get(key) ?? []).filter(t => now() - t < 60_000)
        if (recent.length >= 30) {
          record('verify_rate_limited', { requestId, subjectId: user.id, tenantId: user.tenantId })
          return fail(res, 429, 'RATE_LIMITED', '请求过于频繁', requestId)
        }
        recent.push(now())
        verifyAttempts.set(key, recent)
        const body = await readJson(req)
        const raw = normalizeCode(body?.code)
        if (!raw || typeof body?.caseId !== 'string' || !/^[A-Z0-9-]{4,40}$/.test(body.caseId)) {
          record('verify_invalid', { requestId, subjectId: user.id, tenantId: user.tenantId })
          return fail(res, 400, 'INVALID_INPUT', '核验输入无效', requestId)
        }
        const leaseRow = db.prepare('SELECT * FROM leases WHERE raw = ?').get(raw)
        const lease = leaseRow && { code: formatCode(raw), tenantId: leaseRow.tenant_id, subjectId: leaseRow.subject_id, alias: leaseRow.alias, resourceId: leaseRow.resource_id, accessEventId: leaseRow.access_event_id, issuedAt: leaseRow.issued_at, expiresAt: leaseRow.expires_at }
        const codeHash = createHash('sha256').update(raw).digest('hex')
        if (!lease || lease.tenantId !== user.tenantId) {
          record(lease ? 'verify_cross_tenant' : 'verify_not_found', { requestId, subjectId: user.id,
            tenantId: user.tenantId, caseId: body.caseId, codeHash })
          return fail(res, 404, 'NOT_FOUND', '未找到可核验记录', requestId)
        }
        record('verify_match', { requestId, subjectId: user.id, tenantId: user.tenantId,
          caseId: body.caseId, accessEventId: lease.accessEventId, codeHash })
        return send(res, 200, { match: { code: lease.code, tenantId: lease.tenantId, alias: lease.alias,
          resourceId: lease.resourceId, issuedAt: lease.issuedAt, expiresAt: lease.expiresAt,
          accessEventId: lease.accessEventId } }, requestId)
      }

      return fail(res, 404, 'NOT_FOUND', '接口不存在', requestId)
    } catch (error) {
      if (error?.status) return fail(res, error.status, error.code, error.message, requestId)
      try { record('server_error', { requestId }) } catch { /* 数据库故障时仍需向客户端返回稳定错误 */ }
      const storageFailed = typeof error?.code === 'string' && error.code.startsWith('SQLITE_')
      return fail(res, storageFailed ? 503 : 500, storageFailed ? 'STORAGE_UNAVAILABLE' : 'INTERNAL_ERROR', '服务暂不可用', requestId)
    }
  })

  server.on('close', () => db.close())
  return { server, getAudit: () => [...audit] }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('演示身份和内存审计不可用于生产环境')
  }
  const port = Number(process.env.PORT ?? 4173)
  const { server } = createApiServer({ webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', dbPath: process.env.WM_DB_PATH ?? resolve('artifacts/runtime/watermark.sqlite') })
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Demo API listening on http://127.0.0.1:${port}\n`)
  })
}
