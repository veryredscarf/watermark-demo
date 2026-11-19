const TILE = 160
const escapeXml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch])

export function createWatermarkImage({ signalId, code, alias }) {
  if (!/^[0-9a-f]{16}$/.test(signalId)) throw new Error('Invalid signal id')
  const bits = [...signalId].flatMap(ch => Number.parseInt(ch, 16).toString(2).padStart(4, '0').split(''))
  const cells = bits.map((bit, index) => {
    const x = (index % 8) * 20
    const y = 32 + Math.floor(index / 8) * 16
    const left = bit === '1' ? '#101820' : '#ffffff'
    const right = bit === '1' ? '#ffffff' : '#101820'
    return `<rect x="${x + 2}" y="${y + 5}" width="6" height="6" fill="${left}" opacity=".05"/><rect x="${x + 12}" y="${y + 5}" width="6" height="6" fill="${right}" opacity=".05"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}"><text x="8" y="12" font-size="9" font-family="sans-serif" fill="#24345c" opacity=".5">${escapeXml(alias)}</text><text x="8" y="25" font-size="7" font-family="monospace" fill="#24345c" opacity=".5">${escapeXml(code)}</text>${cells}</svg>`
  return { algorithmVersion: 'lab-pair-1', signalId, imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: TILE, height: TILE }
}
