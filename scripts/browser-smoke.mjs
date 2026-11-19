import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = process.cwd()
const node = process.execPath
const chrome = process.env.WM_CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync)
if (!chrome) throw new Error('Set WM_CHROME_PATH to a Chromium browser executable')
const profile = mkdtempSync(join(tmpdir(), 'wm-browser-'))
const processes = []
const start = (exe, args, cwd = root, env = process.env) => {
  const child = spawn(exe, args, { cwd, env, stdio: 'ignore', windowsHide: true })
  processes.push(child)
  return child
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitUrl = async url => {
  for (let i = 0; i < 100; i++) {
    try { const res = await fetch(url); if (res.ok) return res } catch {}
    await pause(100)
  }
  throw new Error(`Timeout: ${url}`)
}

try {
  start(node, ['apps/api/server.mjs'], root, { ...process.env, WM_DB_PATH: ':memory:' })
  start(node, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--configLoader', 'native'], join(root, 'apps/web'))
  await waitUrl('http://127.0.0.1:5173/')
  start(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=9227', `--user-data-dir=${profile}`, '--window-size=1280,720'])
  const browser = await (await waitUrl('http://127.0.0.1:9227/json/version')).json()
  const ws = new WebSocket(browser.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = new Map()
  ws.onmessage = event => {
    const data = JSON.parse(event.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) reject(new Error(data.error.message)); else resolve(data.result)
    }
  }
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const callId = ++id
    pending.set(callId, { resolve, reject })
    ws.send(JSON.stringify({ id: callId, method, params, sessionId }))
  })
  const target = await command('Target.createTarget', { url: 'http://localhost:5173/' })
  const attached = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const sid = attached.sessionId
  await command('Page.enable', {}, sid)
  await command('Runtime.enable', {}, sid)
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid)
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  for (let i = 0; i < 100; i++) {
    if (await evaluate("!!document.querySelector('.login-panel button.primary-button')")) break
    await pause(100)
  }
  await evaluate("document.querySelector('.login-panel button.primary-button').click()")
  for (let i = 0; i < 100; i++) {
    if (await evaluate("!!document.querySelector('.lab-panel input[type=file]') && !!document.querySelector('.stat-grid')")) break
    await pause(100)
  }
  const state = await evaluate("(async () => ({label: document.querySelector('.lab-panel h3')?.textContent, image: document.querySelector('.watermark-preview')?.naturalWidth, hasOverlay: !!document.querySelector('.wm-layer'), signalId: (await (await fetch('/api/demo/me')).json()).watermark?.signalId }))()")
  if (!state.image) throw new Error(`No service image: ${JSON.stringify(state)}; page=${await evaluate("document.body?.innerText.slice(-500)")}`)
  const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sid)
  writeFileSync(join(root, 'artifacts/runtime/browser-original.png'), Buffer.from(screenshot.data, 'base64'))
  await evaluate(`(async () => { const blob = await (await fetch('data:image/png;base64,${screenshot.data}')).blob(); const input = document.querySelector('.lab-panel input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([blob], 'browser-original.png', {type:'image/png'})); input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`)
  let outcome = ''
  for (let i = 0; i < 100; i++) {
    outcome = await evaluate("document.querySelector('.lab-panel')?.textContent || ''")
    if (outcome.includes('browser-original.png：')) break
    await pause(100)
  }
  console.log(JSON.stringify({ browser: browser.Browser, state, outcome: outcome.slice(-250) }))
  if (!outcome.includes('匹配当前水印')) throw new Error('Original browser screenshot not matched')
  const crop = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: 600, y: 0, width: 640, height: 360, scale: 1 } }, sid)
  writeFileSync(join(root, 'artifacts/runtime/browser-crop-640x360.png'), Buffer.from(crop.data, 'base64'))
  await evaluate(`(async () => { const blob = await (await fetch('data:image/png;base64,${crop.data}')).blob(); const input = document.querySelector('.lab-panel input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([blob], 'crop-640x360.png', {type:'image/png'})); input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`)
  for (let i = 0; i < 100; i++) {
    outcome = await evaluate("document.querySelector('.lab-panel')?.textContent || ''")
    if (outcome.includes('crop-640x360.png：')) break
    await pause(100)
  }
  console.log(JSON.stringify({ cropOutcome: outcome.slice(-180) }))
  if (!outcome.includes('crop-640x360.png：匹配当前水印')) throw new Error('640x360 crop not matched')
  const coreUrl = `/@fs/${root.replaceAll('\\', '/')}/packages/watermark-core/src/index.ts`
  for (const name of ['original-chrome154.png', 'crop-640x360-chrome154.png']) {
    const fixture = readFileSync(join(root, 'tests/fixtures', name)).toString('base64')
    const result = await evaluate(`(async () => { const { extractCurrentSignal } = await import(${JSON.stringify(coreUrl)}); const blob = await (await fetch('data:image/png;base64,${fixture}')).blob(); const bitmap = await createImageBitmap(blob); const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close(); return extractCurrentSignal(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, '49e350bb53366479'); })()`)
    console.log(JSON.stringify({ fixture: name, result }))
    if (result.status !== 'matched' || result.recoveredSignalId !== '49e350bb53366479') throw new Error(`Fixed fixture failed: ${name}`)
  }
  ws.close()
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  for (const child of processes.reverse()) child.kill()
  await pause(500)
  try {
    if (!resolve(profile).startsWith(resolve(tmpdir(), 'wm-browser-'))) throw new Error('Unexpected profile path')
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
  catch (error) { console.error('Temporary browser profile cleanup failed:', error.message) }
}
