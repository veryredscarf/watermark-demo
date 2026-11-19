export interface WatermarkLease {
  code: string
  signalId: string
  imageDataUrl: string
  width: number
  height: number
  algorithmVersion: 'lab-pair-1'
  issuedAt: string
  expiresAt: string
  displayText: string
  policyVersion: string
  layout: { density: 'standard'; opacity: number }
}

export function isWatermarkLease(value: unknown): value is WatermarkLease {
  if (!value || typeof value !== 'object') return false
  const lease = value as Partial<WatermarkLease>
  return typeof lease.code === 'string'
    && /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){4}$/.test(lease.code)
    && typeof lease.signalId === 'string' && /^[0-9a-f]{16}$/.test(lease.signalId)
    && typeof lease.imageDataUrl === 'string' && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(lease.imageDataUrl)
    && lease.width === 160 && lease.height === 160
    && lease.algorithmVersion === 'lab-pair-1'
    && typeof lease.issuedAt === 'string' && Number.isFinite(Date.parse(lease.issuedAt))
    && typeof lease.expiresAt === 'string' && Number.isFinite(Date.parse(lease.expiresAt))
    && typeof lease.displayText === 'string' && lease.displayText.length <= 120
    && typeof lease.policyVersion === 'string'
    && lease.layout?.density === 'standard'
    && typeof lease.layout.opacity === 'number'
    && lease.layout.opacity >= 0.05 && lease.layout.opacity <= 0.25
}

export type ExtractionResult = { status: 'matched' | 'uncertain' | 'not_detected'; score: number; matchingBits: number; recoveredSignalId: string | null; x: number; y: number }

export function extractCurrentSignal(pixels: Uint8ClampedArray, width: number, height: number, signalId: string): ExtractionResult {
  if (!/^[0-9a-f]{16}$/.test(signalId)) throw new Error('Invalid signal id')
  if (width < 640 || height < 360) return { status: 'uncertain', score: 0, matchingBits: 0, recoveredSignalId: null, x: 0, y: 0 }
  const bits = [...signalId].flatMap(ch => Number.parseInt(ch, 16).toString(2).padStart(4, '0').split('').map(Number))
  const luminance = (x: number, y: number) => {
    const p = (y * width + x) * 4
    return pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722
  }
  let best: ExtractionResult = { status: 'not_detected', score: -Infinity, matchingBits: 0, recoveredSignalId: null, x: 0, y: 0 }
  for (let y = 0; y < 160 && y + 160 <= height; y++) {
    for (let x = 0; x < 160 && x + 160 <= width; x++) {
      let total = 0
      let matchingBits = 0
      for (let bit = 0; bit < 64; bit++) {
        const cx = x + (bit % 8) * 20
        const cy = y + 32 + Math.floor(bit / 8) * 16 + 8
        const delta = luminance(cx + 15, cy) - luminance(cx + 5, cy)
        const signed = bits[bit] ? delta : -delta
        total += signed
        if (signed > 2) matchingBits++
      }
      const score = total / 64
      if (matchingBits > best.matchingBits || (matchingBits === best.matchingBits && score > best.score)) {
        best = { status: 'not_detected', score, matchingBits, recoveredSignalId: null, x, y }
      }
    }
  }
  if (best.score >= 8 && best.matchingBits >= 52) best.status = 'matched'
  else if (best.score >= 4 && best.matchingBits >= 42) best.status = 'uncertain'
  if (best.status === 'matched') {
    let decoded = ''
    for (let bit = 0; bit < 64; bit++) {
      const cx = best.x + (bit % 8) * 20
      const cy = best.y + 32 + Math.floor(bit / 8) * 16 + 8
      decoded += luminance(cx + 15, cy) > luminance(cx + 5, cy) ? '1' : '0'
    }
    best.recoveredSignalId = Array.from({ length: 16 }, (_, n) => Number.parseInt(decoded.slice(n * 4, n * 4 + 4), 2).toString(16)).join('')
    if (best.recoveredSignalId !== signalId) {
      best.status = 'uncertain'
      best.recoveredSignalId = null
    }
  }
  return best
}
