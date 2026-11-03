import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiServer } from '../server.mjs'

async function startApi(options) {
  const api = createApiServer(options)
  await new Promise(resolve => api.server.listen(0, '127.0.0.1', resolve))
  const address = api.server.address()
  return {
    ...api,
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => api.server.close(resolve)),
  }
}

async function request(api, path, { cookie, method = 'GET', body } = {}) {
  const response = await fetch(`${api.base}${path}`, {
    method,
    headers: {
      ...(method === 'POST' ? { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { response, data: await response.json() }
}

async function login(api, userKey) {
  const { response, data } = await request(api, '/api/demo/login', { method: 'POST', body: { userKey } })
  assert.equal(response.status, 200)
  return { cookie: response.headers.get('set-cookie').split(';')[0], user: data.user }
}

test('授权访问同时返回租户内容和唯一水印；核验仅允许同租户调查员', async t => {
  const api = await startApi()
  t.after(api.close)

  const unauth = await request(api, '/api/protected/report/view')
  assert.equal(unauth.response.status, 401)
  assert.equal(unauth.data.content, undefined)

  const alpha = await login(api, 'qinghe')
  const first = await request(api, '/api/protected/report/view', { cookie: alpha.cookie })
  const second = await request(api, '/api/protected/report/view', { cookie: alpha.cookie })
  assert.equal(first.response.status, 200)
  assert.equal(first.data.content.title, '经营概览 · 甲租户')
  assert.match(first.data.watermark.code, /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){4}$/)
  assert.notEqual(first.data.watermark.code, second.data.watermark.code)

  const beta = await login(api, 'haitang')
  const betaView = await request(api, '/api/protected/report/view', { cookie: beta.cookie })
  assert.equal(betaView.data.content.title, '经营概览 · 乙租户')
  assert.notDeepEqual(first.data.content, betaView.data.content)

  const denied = await request(api, '/api/watermark/v1/verify', {
    cookie: alpha.cookie, method: 'POST', body: { code: first.data.watermark.code, caseId: 'CASE-001' },
  })
  assert.equal(denied.response.status, 403)

  const auditor = await login(api, 'auditor')
  const match = await request(api, '/api/watermark/v1/verify', {
    cookie: auditor.cookie, method: 'POST', body: { code: first.data.watermark.code, caseId: 'CASE-001' },
  })
  assert.equal(match.response.status, 200)
  assert.equal(match.data.match.alias, '青禾')
  assert.equal(match.data.match.tenantId, 'alpha')

  const crossTenant = await request(api, '/api/watermark/v1/verify', {
    cookie: auditor.cookie, method: 'POST', body: { code: betaView.data.watermark.code, caseId: 'CASE-001' },
  })
  const unknown = await request(api, '/api/watermark/v1/verify', {
    cookie: auditor.cookie, method: 'POST', body: { code: 'AAAA-AAAA-AAAA-AAAA-AAAA', caseId: 'CASE-001' },
  })
  assert.equal(crossTenant.response.status, 404)
  assert.deepEqual(crossTenant.data.error, unknown.data.error)
  assert.ok(api.getAudit().some(event => event.type === 'verify_cross_tenant'))
  assert.ok(api.getAudit().some(event => event.type === 'verify_match'))
})

test('无资源权限及签发失败时不返回敏感内容', async t => {
  const api = await startApi({ signingAvailable: () => false })
  t.after(api.close)
  const visitor = await login(api, 'visitor')
  const forbidden = await request(api, '/api/protected/report/view', { cookie: visitor.cookie })
  assert.equal(forbidden.response.status, 403)
  assert.equal(forbidden.data.content, undefined)
  const employee = await login(api, 'qinghe')
  const unavailable = await request(api, '/api/protected/report/view', { cookie: employee.cookie })
  assert.equal(unavailable.response.status, 503)
  assert.equal(unavailable.data.error.code, 'SIGNING_UNAVAILABLE')
  assert.equal(unavailable.data.content, undefined)
})

test('写请求校验来源；格式错误的核验会被记录', async t => {
  const api = await startApi()
  t.after(api.close)
  const invalidOrigin = await fetch(`${api.base}/api/demo/login`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ userKey: 'qinghe' }) })
  assert.equal(invalidOrigin.status, 403)
  const auditor = await login(api, 'auditor')
  const invalid = await request(api, '/api/watermark/v1/verify', { cookie: auditor.cookie, method: 'POST', body: { code: 'bad', caseId: 'CASE-001' } })
  assert.equal(invalid.response.status, 400)
  assert.ok(api.getAudit().some(event => event.type === 'verify_invalid'))
})
