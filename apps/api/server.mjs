import { createServer } from 'node:http'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

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

export function createApiServer({ now = () => Date.now(), signingAvailable = () => true, webOrigin = 'http://localhost:5173' } = {}) {
  const sessions = new Map()
  const leases = new Map()
  const audit = []
  const verifyAttempts = new Map()

  function record(type, detail) {
    audit.push({ type, at: new Date(now()).toISOString(), ...detail })
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
        const sid = randomBytes(32).toString('hex')
        sessions.set(sid, { user, expiresAt: now() + SESSION_MS })
        record('login', { requestId, subjectId: user.id, tenantId: user.tenantId })
        return send(res, 200, { user: { alias: user.alias, role: user.role, tenantId: user.tenantId } }, requestId, {
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
        return send(res, 200, { user: { alias: user.alias, role: user.role, tenantId: user.tenantId } }, requestId)
      }

      if (req.method === 'GET' && pathname === '/api/protected/report/view') {
        if (user.role !== 'employee' || !REPORTS[user.tenantId]) {
          record('access_denied', { requestId, subjectId: user.id, tenantId: user.tenantId, resourceId: 'report' })
          return fail(res, 403, 'FORBIDDEN', '没有访问权限', requestId)
        }
        if (!signingAvailable()) {
          record('signing_unavailable', { requestId, subjectId: user.id, tenantId: user.tenantId, resourceId: 'report' })
          return fail(res, 503, 'SIGNING_UNAVAILABLE', '水印服务暂不可用', requestId)
        }
        let raw
        do { raw = encodeBase32(randomBytes(12)) } while (leases.has(raw))
        const issuedAt = new Date(now()).toISOString()
        const expiresAt = new Date(now() + LEASE_MS).toISOString()
        const accessEventId = randomUUID()
        const code = formatCode(raw)
        const lease = { code, tenantId: user.tenantId, subjectId: user.id, alias: user.alias,
          resourceId: 'report', accessEventId, issuedAt, expiresAt, status: 'issued' }
        leases.set(raw, lease)
        record('access_granted', { requestId, accessEventId, subjectId: user.id, tenantId: user.tenantId, resourceId: 'report' })
        record('lease_issued', { requestId, accessEventId, codeHash: createHash('sha256').update(raw).digest('hex') })
        return send(res, 200, {
          content: REPORTS[user.tenantId],
          watermark: { code, issuedAt, expiresAt,
            displayText: `内部资料 · ${user.alias} · ${new Date(now()).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`,
            policyVersion: 'v1', layout: { density: 'standard', opacity: 0.12 } },
        }, requestId)
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
        const lease = leases.get(raw)
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
      record('server_error', { requestId })
      return fail(res, 500, 'INTERNAL_ERROR', '服务暂不可用', requestId)
    }
  })

  return { server, getAudit: () => [...audit] }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('演示身份和内存审计不可用于生产环境')
  }
  const port = Number(process.env.PORT ?? 4173)
  const { server } = createApiServer({ webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' })
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Demo API listening on http://127.0.0.1:${port}\n`)
  })
}
