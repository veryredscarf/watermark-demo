import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCurrentSignal } from '../src/index.ts'

function sample(signalId, watermarked) {
  const width = 640, height = 360
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 230; pixels[i + 1] = 230; pixels[i + 2] = 230; pixels[i + 3] = 255 }
  if (watermarked) {
    const bits = [...signalId].flatMap(ch => Number.parseInt(ch, 16).toString(2).padStart(4, '0').split(''))
    for (let tileY = 41; tileY < height; tileY += 160) for (let tileX = 27; tileX < width; tileX += 160) {
      for (let bit = 0; bit < 64; bit++) {
        const x = tileX + (bit % 8) * 20
        const y = tileY + 32 + Math.floor(bit / 8) * 16
        for (const [offset, dark] of [[2, bits[bit] === '1'], [12, bits[bit] !== '1']]) {
          for (let yy = y + 5; yy < y + 11 && yy < height; yy++) for (let xx = x + offset; xx < x + offset + 6 && xx < width; xx++) {
            const value = dark ? 219 : 231
            const p = (yy * width + xx) * 4
            pixels[p] = pixels[p + 1] = pixels[p + 2] = value
          }
        }
      }
    }
  }
  return { pixels, width, height }
}

test('640×360 原图可提取当前实验图块；无水印不误匹配', () => {
  const id = '0123456789abcdef'
  const positive = sample(id, true)
  const matched = extractCurrentSignal(positive.pixels, positive.width, positive.height, id)
  assert.equal(matched.status, 'matched')
  assert.equal(matched.recoveredSignalId, id)
  assert.notEqual(extractCurrentSignal(positive.pixels, positive.width, positive.height, 'fedcba9876543210').status, 'matched')
  const negative = sample(id, false)
  assert.equal(extractCurrentSignal(negative.pixels, negative.width, negative.height, id).status, 'not_detected')
})

test('低于暂定最小尺寸时返回证据不足', () => {
  assert.equal(extractCurrentSignal(new Uint8ClampedArray(320 * 180 * 4), 320, 180, '0123456789abcdef').status, 'uncertain')
})
