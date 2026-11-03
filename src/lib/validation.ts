import { z } from 'zod'

export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use at most 128 characters')
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), 'Include upper and lower case letters and a number')

export const emailSchema = z.email('Enter a valid email address').max(160).transform((e) => e.toLowerCase().trim())
const name = z.string().trim().min(1, 'Required').max(60, 'Too long').regex(/^[\p{L}\p{M}' .-]+$/u, 'Letters only')

export const registerSchema = z.object({ firstName: name, lastName: name, email: emailSchema, password: passwordSchema })
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Required').max(128) })
export const mfaSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') })
export const tokenSchema = z.object({ token: z.string().min(20).max(200) })
export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema })
export const forgotSchema = z.object({ email: emailSchema })
export const profileSchema = z.object({
  firstName: name,
  lastName: name,
  phone: z.string().trim().max(30).regex(/^[+\d ()-]*$/, 'Digits, spaces, +, ( ) and - only'),
})
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, 'Required').max(128), newPassword: passwordSchema })

export const KYC_COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Netherlands', 'Australia', 'Singapore', 'Japan', 'Other'] as const
export const KYC_DOCUMENTS = ['Passport', "Driver's licence", 'National ID card'] as const

export const kycSchema = z.object({
  legalName: z.string().trim().min(3, 'Enter your full legal name').max(120),
  dateOfBirth: z.string().refine((v) => {
    const d = new Date(v)
    if (isNaN(d.getTime())) return false
    const age = (Date.now() - d.getTime()) / (365.25 * 86_400_000)
    return age >= 18 && age < 120
  }, 'You must be at least 18'),
  country: z.enum(KYC_COUNTRIES),
  addressLine1: z.string().trim().min(3, 'Required').max(120),
  city: z.string().trim().min(2, 'Required').max(80),
  postalCode: z.string().trim().min(2, 'Required').max(16),
  documentType: z.enum(KYC_DOCUMENTS),
  occupation: z.string().trim().min(2, 'Required').max(80),
  sourceOfFunds: z.enum(['Employment income', 'Savings', 'Investments', 'Other']),
  attest: z.literal(true, 'You must confirm this attestation'),
})

const money = (min: number, max: number) => z.number('Enter an amount').finite().min(min, 'Enter an amount').max(max, 'Amount too large')
export const depositSchema = z.object({
  amount: money(0.01, 10_000_000).transform((v) => Math.round(v * 100) / 100),
  method: z.enum(['BANK_TRANSFER', 'CARD'], 'Choose a payment method'),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, 'Invalid request key'),
})

export const TICKET_CATEGORIES = ['Account access', 'Funding', 'Withdrawals', 'Trading', 'Verification', 'Statements', 'Other'] as const
export const ticketSchema = z.object({
  subject: z.string().trim().min(4, 'Add a short subject').max(120),
  category: z.enum(TICKET_CATEGORIES),
  message: z.string().trim().min(10, 'Describe the issue in a little more detail').max(4000),
})
export const ticketReplySchema = z.object({ body: z.string().trim().min(2, 'Write a reply').max(4000) })

export const adjustmentSchema = z.object({
  amount: z
    .number('Enter an amount')
    .finite()
    .refine((v) => v !== 0, 'Amount cannot be zero')
    .refine((v) => Math.abs(v) <= 1_000_000, 'Amount too large')
    .transform((v) => Math.round(v * 100) / 100),
  reason: z.string().trim().min(10, 'Explain the correction (10+ characters)').max(500),
  evidence: z.string().trim().max(200).optional(),
})
export const withdrawSchema = z.object({ amount: money(0.01, 10_000_000).transform((v) => Math.round(v * 100) / 100), note: z.string().trim().max(200).optional() })
export const tradeSchema = z.object({
  side: z.enum(['buy', 'sell']),
  mode: z.enum(['amount', 'shares']),
  value: z.number('Enter a value').finite().positive('Must be greater than 0').max(10_000_000),
})
