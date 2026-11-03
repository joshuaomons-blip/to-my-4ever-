import { z } from 'zod'
import { emailSchema } from './validation'

export const PERMISSION_KEYS = [
  'customers:read', 'customers:manage', 'kyc:review', 'transactions:read', 'transactions:export',
  'withdrawals:review', 'content:manage', 'settings:manage', 'admins:manage', 'audit:read',
] as const

export const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Title is required').max(100),
  body: z.string().trim().min(3, 'Message is required').max(500),
  level: z.enum(['info', 'success', 'warning']),
  active: z.boolean(),
})

export const faqSchema = z.object({
  question: z.string().trim().min(5, 'Question is required').max(200),
  answer: z.string().trim().min(5, 'Answer is required').max(2000),
  sortOrder: z.number().int().min(0).max(999),
  published: z.boolean(),
})

export const broadcastSchema = z
  .object({
    audience: z.enum(['all', 'user']),
    email: z.string().trim().max(160).optional(),
    title: z.string().trim().min(3, 'Title is required').max(100),
    body: z.string().trim().min(3, 'Message is required').max(500),
    level: z.enum(['info', 'success', 'warning']),
  })
  .refine((v) => v.audience === 'all' || (v.email && /.+@.+\..+/.test(v.email)), { message: 'Enter the customer email', path: ['email'] })

const adminRole = z.enum(['SUPPORT', 'ADMIN', 'SUPER_ADMIN'])
export const createAdminSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1, 'Required').max(60),
  lastName: z.string().trim().min(1, 'Required').max(60),
  role: adminRole,
  permissions: z.array(z.enum(PERMISSION_KEYS)).optional(),
})
export const updateAdminSchema = z.object({
  role: adminRole.optional(),
  permissions: z.array(z.enum(PERMISSION_KEYS)).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
})
