export interface WatermarkLease {
  code: string
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
    && typeof lease.issuedAt === 'string' && Number.isFinite(Date.parse(lease.issuedAt))
    && typeof lease.expiresAt === 'string' && Number.isFinite(Date.parse(lease.expiresAt))
    && typeof lease.displayText === 'string' && lease.displayText.length <= 120
    && typeof lease.policyVersion === 'string'
    && lease.layout?.density === 'standard'
    && typeof lease.layout.opacity === 'number'
    && lease.layout.opacity >= 0.05 && lease.layout.opacity <= 0.25
}
