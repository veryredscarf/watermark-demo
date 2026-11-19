import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApiServer } from '../server.mjs'

async function startApi(options = {}) {
  const api = createApiServer({ dbPath: ':memory:', ...options })
  await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  return { ...api, base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => api.server.close(resolve)) }
}
async function request(api, path, { cookie, method = 'GET', body } = {}) {
  const response = await fetch(`${api.base}${path}`, { method,
    headers: { ...(method === 'POST' ? { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { response, data: await response.json() }
}
async function login(api, userKey) {
  const { response, data } = await request(api, '/api/demo/login', { method: 'POST', body: { userKey } })
  assert.equal(response.status, 200)
  return { cookie: response.headers.get('set-cookie').split(';')[0], user: data.user, watermark: data.watermark }
}

test('模拟登录签发图片，列表读取复用当前租约，刷新产生新图；租户核验隔离', async t => {
  const api = await startApi(); t.after(api.close)
  const unauth = await request(api, '/api/protected/report/view')
  assert.equal(unauth.response.status, 401)
  const alpha = await login(api, 'qinghe')
  assert.match(alpha.watermark.imageDataUrl, /^data:image\/svg\+xml;base64,/)
  assert.equal(alpha.watermark.width, 160)
  assert.match(alpha.watermark.signalId, /^[0-9a-f]{16}$/)
  const first = await request(api, '/api/protected/report/view', { cookie: alpha.cookie })
  const second = await request(api, '/api/protected/report/view', { cookie: alpha.cookie })
  assert.equal(first.response.status, 200)
  assert.equal(first.data.watermark.code, alpha.watermark.code)
  assert.equal(second.data.watermark.code, alpha.watermark.code)
  const renewed = await request(api, '/api/demo/refresh-watermark', { cookie: alpha.cookie, method: 'POST' })
  assert.notEqual(renewed.data.watermark.code, alpha.watermark.code)
  const beta = await login(api, 'haitang')
  const betaView = await request(api, '/api/protected/report/view', { cookie: beta.cookie })
  assert.notDeepEqual(first.data.content, betaView.data.content)
  const auditor = await login(api, 'auditor')
  const match = await request(api, '/api/watermark/v1/verify', { cookie: auditor.cookie, method: 'POST', body: { code: alpha.watermark.code, caseId: 'CASE-001' } })
  assert.equal(match.response.status, 200)
  const cross = await request(api, '/api/watermark/v1/verify', { cookie: auditor.cookie, method: 'POST', body: { code: beta.watermark.code, caseId: 'CASE-001' } })
  assert.equal(cross.response.status, 404)
})

test('签发失败时模拟登录不返回水印或内容', async t => {
  const api = await startApi({ signingAvailable: () => false }); t.after(api.close)
  const loginResult = await request(api, '/api/demo/login', { method: 'POST', body: { userKey: 'qinghe' } })
  assert.equal(loginResult.response.status, 503)
  assert.equal(loginResult.data.watermark, undefined)
  const view = await request(api, '/api/protected/report/view')
  assert.equal(view.response.status, 401)
  assert.equal(view.data.content, undefined)
})

test('来源校验与核验输入错误留痕', async t => {
  const api = await startApi(); t.after(api.close)
  const invalidOrigin = await fetch(`${api.base}/api/demo/login`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ userKey: 'qinghe' }) })
  assert.equal(invalidOrigin.status, 403)
  const auditor = await login(api, 'auditor')
  const invalid = await request(api, '/api/watermark/v1/verify', { cookie: auditor.cookie, method: 'POST', body: { code: 'bad', caseId: 'CASE-001' } })
  assert.equal(invalid.response.status, 400)
  assert.ok(api.getAudit().some(event => event.type === 'verify_invalid'))
})

test('SQLite 文件跨服务重启仍可核验签发记录', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wm-lease-test-'))
  const dbPath = join(dir, 'watermark.sqlite')
  try {
    const first = await startApi({ dbPath })
    const employee = await login(first, 'qinghe')
    await first.close()
    const second = await startApi({ dbPath })
    try {
      const auditor = await login(second, 'auditor')
      const result = await request(second, '/api/watermark/v1/verify', { cookie: auditor.cookie, method: 'POST', body: { code: employee.watermark.code, caseId: 'CASE-RESTART' } })
      assert.equal(result.response.status, 200)
      assert.equal(result.data.match.alias, '青禾')
    } finally { await second.close() }
  } finally {
    for (const name of ['watermark.sqlite', 'watermark.sqlite-wal', 'watermark.sqlite-shm']) rmSync(join(dir, name), { force: true })
    rmdirSync(dir)
  }
})