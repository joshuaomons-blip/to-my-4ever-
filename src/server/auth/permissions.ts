import type { Role } from '@prisma/client'

export const PERMISSIONS = {
  'customers:read': 'View customers, accounts and portfolios',
  'customers:manage': 'Suspend, reactivate and flag customers',
  'kyc:review': 'Approve or reject identity verification',
  'transactions:read': 'View all transactions',
  'transactions:export': 'Export transaction reports',
  'withdrawals:review': 'Approve or reject withdrawals',
  'payments:review': 'View deposits and payment-provider events, re-check deposit status',
  'ledger:adjust': 'Request balance corrections (applied instantly in demo mode)',
  'ledger:approve': 'Approve corrections to real-money records (second approver)',
  'support:manage': 'Read and answer customer support tickets',
  'content:manage': 'Manage website content, announcements, FAQ and notifications',
  'settings:manage': 'Change platform branding, fees and limits',
  'admins:manage': 'Create administrators and assign permissions',
  'audit:read': 'View audit logs',
} as const

export type Permission = keyof typeof PERMISSIONS
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

export const ROLE_DEFAULTS: Record<Exclude<Role, 'CUSTOMER'>, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: [
    'customers:read',
    'customers:manage',
    'kyc:review',
    'transactions:read',
    'transactions:export',
    'withdrawals:review',
    'payments:review',
    'ledger:adjust',
    'content:manage',
    'support:manage',
    'audit:read',
  ],
  SUPPORT: ['customers:read', 'transactions:read', 'kyc:review', 'support:manage'],
}

export const ADMIN_ROLES: Role[] = ['SUPPORT', 'ADMIN', 'SUPER_ADMIN']
export const isAdminRole = (role: Role) => ADMIN_ROLES.includes(role)

export function effectivePermissions(user: { role: Role; permissions: string[] }): Permission[] {
  if (user.role === 'SUPER_ADMIN') return ALL_PERMISSIONS
  if (user.role === 'CUSTOMER') return []
  // Stored permissions are authoritative; never grant admins:manage below SUPER_ADMIN.
  return user.permissions.filter((p): p is Permission => p in PERMISSIONS && p !== 'admins:manage')
}

export function can(user: { role: Role; permissions: string[] }, permission: Permission) {
  return effectivePermissions(user).includes(permission)
}
