import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { prisma } from '@/server/db'

export const ACCENTS = {
  signal: { label: 'Signal Red', hex: '#E82127' },
  ember: { label: 'Ember Orange', hex: '#F2602E' },
  volt: { label: 'Volt Blue', hex: '#3B82F6' },
  silver: { label: 'Platinum', hex: '#C9CCD1' },
} as const
export type AccentKey = keyof typeof ACCENTS

const imageDataUrl = z
  .string()
  .max(280_000, 'Logo must be under 200 KB')
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Logo must be a PNG, JPEG or WebP image')

export const settingsSchemas = {
  branding: z.object({
    platformName: z.string().trim().min(2).max(40),
    tagline: z.string().trim().max(80),
    logoDataUrl: z.union([imageDataUrl, z.literal('')]),
  }),
  appearance: z.object({
    accent: z.enum(Object.keys(ACCENTS) as [AccentKey, ...AccentKey[]]),
    heroStyle: z.enum(['grid', 'aurora', 'minimal']),
  }),
  homepage: z.object({
    heroEyebrow: z.string().trim().max(60),
    heroHeadline: z.string().trim().min(4).max(90),
    heroSubtext: z.string().trim().max(320),
    primaryCta: z.string().trim().min(2).max(30),
    secondaryCta: z.string().trim().min(2).max(30),
  }),
  support: z.object({
    email: z.email().max(120),
    phone: z.string().trim().max(40),
    hours: z.string().trim().max(80),
    note: z.string().trim().max(300),
  }),
  investmentInfo: z.object({
    title: z.string().trim().min(2).max(80),
    body: z.string().trim().max(4000),
  }),
  maintenance: z.object({
    enabled: z.boolean(),
    message: z.string().trim().max(300),
  }),
  trading: z
    .object({
      feeBps: z.number().int().min(0).max(500),
      feeFlat: z.number().min(0).max(50),
      minOrder: z.number().min(1).max(10_000),
      minDeposit: z.number().min(1).max(100_000),
      maxDeposit: z.number().min(10).max(1_000_000),
      minWithdrawal: z.number().min(1).max(100_000),
      depositSettlementSeconds: z.number().int().min(0).max(3600),
    })
    .refine((v) => v.maxDeposit >= v.minDeposit, { message: 'Max deposit must be ≥ min deposit', path: ['maxDeposit'] }),
  security: z.object({
    requireAdminMfa: z.boolean(),
  }),
} as const

export type SettingsKey = keyof typeof settingsSchemas
export type Settings = { [K in SettingsKey]: z.infer<(typeof settingsSchemas)[K]> }

export const DEFAULT_SETTINGS: Settings = {
  branding: { platformName: 'Tesla Investment', tagline: 'TSLA education & sandbox brokerage', logoDataUrl: '' },
  appearance: { accent: 'signal', heroStyle: 'grid' },
  homepage: {
    heroEyebrow: 'Sandbox brokerage · Virtual funds',
    heroHeadline: 'Invest in the Future of Innovation.',
    heroSubtext:
      'Learn how TSLA trades, build a portfolio with virtual funds, and practise every step — funding, fractional buys, sells and withdrawals — in a risk-free sandbox.',
    primaryCta: 'Open sandbox account',
    secondaryCta: 'Explore TSLA',
  },
  support: {
    email: 'support@example.com',
    phone: '+1 (555) 010-0199',
    hours: 'Mon–Fri, 9:00–17:00 ET',
    note: 'This is a sandbox environment. No real money is held, so support cannot recover or transfer funds.',
  },
  investmentInfo: {
    title: 'About TSLA',
    body:
      'Tesla, Inc. (Nasdaq: TSLA) designs and manufactures electric vehicles, battery energy storage and solar products. The stock is known for high volatility relative to the broader market.\n\nThis platform is an independent sandbox. Prices shown are simulated and are not real-time market data. Nothing here is investment advice.',
  },
  maintenance: { enabled: false, message: 'We are performing scheduled maintenance. Trading and funding are temporarily paused.' },
  trading: {
    feeBps: 10,
    feeFlat: 0,
    minOrder: 1,
    minDeposit: 10,
    maxDeposit: 250_000,
    minWithdrawal: 25,
    depositSettlementSeconds: 10,
  },
  security: { requireAdminMfa: false },
}

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await prisma.siteSetting.findMany()
  const out = structuredClone(DEFAULT_SETTINGS) as Record<SettingsKey, unknown>
  for (const row of rows) {
    const key = row.key as SettingsKey
    if (!(key in settingsSchemas)) continue
    const merged = { ...(DEFAULT_SETTINGS[key] as object), ...(row.value as object) }
    const parsed = settingsSchemas[key].safeParse(merged)
    if (parsed.success) out[key] = parsed.data
  }
  return out as Settings
})

export async function saveSetting<K extends SettingsKey>(key: K, value: Settings[K]) {
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  })
}
