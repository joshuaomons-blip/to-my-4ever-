/**
 * End-to-end API test against a running server (default http://localhost:3000).
 *
 *   npm run dev            # in another terminal
 *   npm run test:e2e
 *
 * Covers: registration, email verification, login, MFA, password reset, admin setup/login,
 * KYC review, deposits (pending → settled), buys, sells, withdrawals (approve / reject / cancel),
 * transaction history, PDF statements, customer management, RBAC and CSRF protection.
 *
 * Needs a super admin. If none exists it is created through /admin/setup using
 * ADMIN_SETUP_TOKEN; otherwise set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { totpCode } from '../src/server/security/totp'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const prisma = new PrismaClient()

let passed = 0
let failed = 0
const results: string[] = []
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) {
    passed++
    results.push(`  ✔ ${name}`)
  } else {
    failed++
    results.push(`  ✖ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
  }
}
function section(title: string) {
  results.push(`\n▸ ${title}`)
}

class Client {
  cookies = new Map<string, string>()
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(BASE + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        'User-Agent': 'e2e-test',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';')
      const [k, ...v] = pair.split('=')
      const val = v.join('=')
      if (!val || /expires=Thu, 01 Jan 1970/i.test(c) || /max-age=0/i.test(c)) this.cookies.delete(k)
      else this.cookies.set(k, val)
    }
    const ct = res.headers.get('content-type') ?? ''
    const data = ct.includes('json') ? await res.json() : ct.includes('text') ? await res.text() : Buffer.from(await res.arrayBuffer())
    return { status: res.status, data, headers: res.headers }
  }
  get = (p: string) => this.req('GET', p)
  post = (p: string, b: unknown = {}) => this.req('POST', p, b)
}

const latestEmailLink = async (to: string, pathPrefix: string) => {
  const mail = await prisma.outboxEmail.findFirst({ where: { to }, orderBy: { createdAt: 'desc' } })
  const m = mail?.body.match(new RegExp(`${pathPrefix}\\?token=([A-Za-z0-9_-]+)`))
  return m?.[1]
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const tag = randomBytes(4).toString('hex')
  const email = `e2e.${tag}@test.example`
  const password = 'E2e-Passw0rd-' + tag
  const cust = new Client()
  const admin = new Client()

  // ── 1. Registration ───────────────────────────────────────────
  section('1. Customer registration')
  let r = await cust.post('/api/auth/register', { firstName: 'Eve', lastName: 'Tester', email, password: 'short' })
  check('rejects weak password (422)', r.status === 422, r.status)
  r = await cust.post('/api/auth/register', { firstName: 'Eve', lastName: 'Tester', email, password })
  check('registers new customer', r.status === 200, r.data)
  check('sets session cookie', cust.cookies.has('ti_session'))
  r = await cust.get('/api/portfolio')
  check('new account has $0 cash', r.status === 200 && r.data.portfolio.cash === 0, r.data)
  r = await cust.post('/api/funding/deposit', { amount: 100, method: 'Sandbox ACH transfer' })
  check('deposit blocked until email verified (403)', r.status === 403, r.status)
  const verifyToken = await latestEmailLink(email, '/verify-email')
  check('verification email written to sandbox outbox', !!verifyToken)
  r = await cust.post('/api/auth/verify-email', { token: verifyToken })
  check('email verification succeeds', r.status === 200, r.data)
  r = await cust.post('/api/auth/verify-email', { token: verifyToken })
  check('verification token is single-use', r.status === 400, r.status)

  // ── 2. Login ──────────────────────────────────────────────────
  section('2. Customer login')
  await cust.post('/api/auth/logout', { scope: 'customer' })
  r = await cust.get('/api/portfolio')
  check('logged-out request is rejected (401)', r.status === 401, r.status)
  r = await cust.post('/api/auth/login', { email, password: 'Wrong-password-1' })
  check('wrong password rejected (401)', r.status === 401, r.status)
  r = await cust.post('/api/auth/login', { email, password })
  check('correct password signs in', r.status === 200 && r.data.mfa === false, r.data)
  r = await cust.get('/app')
  check('customer dashboard renders (200)', r.status === 200, r.status)

  // ── 3. Administrator login ────────────────────────────────────
  section('3. Administrator login')
  r = await admin.post('/api/admin/auth/login', { email, password })
  check('customer credentials rejected at admin login', r.status === 401, r.status)
  let adminEmail = process.env.E2E_ADMIN_EMAIL
  let adminPassword = process.env.E2E_ADMIN_PASSWORD
  if (!(await prisma.user.count({ where: { role: 'SUPER_ADMIN' } }))) {
    adminEmail = `owner.${tag}@test.example`
    adminPassword = 'Owner-Passw0rd-' + tag
    r = await admin.post('/api/admin/setup', { setupToken: 'wrong-token', firstName: 'Ada', lastName: 'Owner', email: adminEmail, password: adminPassword })
    check('setup rejects wrong token', r.status === 403, r.status)
    r = await admin.post('/api/admin/setup', { setupToken: process.env.ADMIN_SETUP_TOKEN, firstName: 'Ada', lastName: 'Owner', email: adminEmail, password: adminPassword })
    check('secure setup creates first super admin', r.status === 200, r.data)
    await admin.post('/api/auth/logout', { scope: 'admin' })
  }
  r = await new Client().post('/api/admin/setup', { setupToken: process.env.ADMIN_SETUP_TOKEN, firstName: 'X', lastName: 'Y', email: `x.${tag}@test.example`, password: 'Another-Passw0rd' })
  check('setup is disabled once a super admin exists', r.status === 409, r.status)
  if (!adminEmail || !adminPassword) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (a super admin already exists)')
  r = await admin.post('/api/admin/auth/login', { email: adminEmail, password: adminPassword })
  check('super admin signs in', r.status === 200, r.data)
  check('admin uses a separate session cookie', admin.cookies.has('ti_admin') && !admin.cookies.has('ti_session'))
  r = await admin.get('/admin')
  check('admin overview renders (200)', r.status === 200, r.status)

  // ── 10a. Customers can never reach admin routes ───────────────
  section('10a. Admin route isolation')
  r = await cust.get('/api/admin/customers')
  check('customer session cannot call admin API (401)', r.status === 401, r.status)
  const spoof = new Client()
  spoof.cookies.set('ti_admin', cust.cookies.get('ti_session')!)
  r = await spoof.get('/api/admin/customers')
  check('customer token in admin cookie is rejected (401)', r.status === 401, r.status)
  r = await cust.get('/admin')
  check('customer visiting /admin is redirected to admin login', r.status === 307 && String(r.headers.get('location')).includes('/admin/login'), r.status)
  r = await admin.get('/api/portfolio')
  check('admin session cannot use customer API (401)', r.status === 401, r.status)

  // ── 5. Simulated deposits ─────────────────────────────────────
  section('5. Simulated deposits')
  r = await cust.post('/api/funding/deposit', { amount: 5, method: 'Sandbox ACH transfer' })
  check('below minimum rejected (422)', r.status === 422, r.status)
  r = await cust.post('/api/funding/deposit', { amount: 100, method: 'Real Bank 1234' })
  check('non-sandbox method rejected (422)', r.status === 422, r.status)
  r = await cust.post('/api/funding/deposit', { amount: 5000, method: 'Sandbox ACH transfer' })
  check('deposit created as PENDING', r.status === 200 && r.data.transaction.status === 'PENDING', r.data)
  const depRef = r.data.transaction?.reference
  let cash = 0
  for (let i = 0; i < 20; i++) {
    const p = await cust.get('/api/portfolio')
    cash = p.data.portfolio.cash
    if (cash === 5000) break
    await sleep(1000)
  }
  check('deposit settles to COMPLETED and credits $5,000', cash === 5000, cash)

  // ── 4. Account management (KYC) ───────────────────────────────
  section('4. Account management — KYC & customer controls')
  r = await cust.post('/api/trade', { side: 'buy', mode: 'amount', value: 100 })
  check('trading blocked before KYC approval (403)', r.status === 403, r.status)
  const kyc = { legalName: 'Eve Tester', dateOfBirth: '1990-04-12', country: 'United States', addressLine1: '1 Test Way', city: 'Austin', postalCode: '73301', documentType: 'Passport', occupation: 'Engineer', sourceOfFunds: 'Savings', attest: true }
  r = await cust.post('/api/kyc', { ...kyc, dateOfBirth: '2015-01-01' })
  check('KYC rejects under-18 applicant (422)', r.status === 422, r.status)
  r = await cust.post('/api/kyc', kyc)
  check('KYC submitted', r.status === 200, r.data)
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  r = await admin.post(`/api/admin/kyc/${user.id}`, { decision: 'reject' })
  check('KYC rejection requires a reason (422)', r.status === 422, r.status)
  r = await admin.post(`/api/admin/kyc/${user.id}`, { decision: 'approve', note: 'E2E: documents consistent' })
  check('admin approves KYC', r.status === 200, r.data)
  r = await admin.get(`/api/admin/customers?q=${encodeURIComponent(email)}`)
  check('admin customer search finds the customer', r.status === 200 && r.data.rows.length === 1 && r.data.rows[0].kyc === 'APPROVED', r.data)
  r = await admin.get(`/api/admin/customers/${user.id}`)
  check('admin views individual portfolio and cash', r.status === 200 && r.data.portfolio.cash === 5000, r.data.portfolio)
  r = await admin.post(`/api/admin/customers/${user.id}/flag`, { flagged: true, reason: 'E2E suspicious pattern' })
  check('admin flags suspicious activity', r.status === 200, r.data)
  r = await admin.post(`/api/admin/customers/${user.id}/notes`, { body: 'E2E internal note' })
  check('admin adds internal note', r.status === 200, r.data)
  r = await admin.post(`/api/admin/customers/${user.id}/status`, { action: 'suspend', reason: 'E2E suspension test' })
  check('admin suspends account', r.status === 200, r.data)
  r = await cust.get('/api/portfolio')
  check('suspended customer session is revoked (401)', r.status === 401, r.status)
  r = await cust.post('/api/auth/login', { email, password })
  check('suspended customer cannot sign in (403)', r.status === 403, r.status)
  r = await admin.post(`/api/admin/customers/${user.id}/status`, { action: 'reactivate', reason: '' })
  check('admin reactivates account', r.status === 200, r.data)
  r = await cust.post('/api/auth/login', { email, password })
  check('reactivated customer can sign in', r.status === 200, r.data)
  await admin.post(`/api/admin/customers/${user.id}/flag`, { flagged: false, reason: '' })

  // ── 6. Simulated TSLA purchases ───────────────────────────────
  section('6. Simulated TSLA purchases')
  r = await cust.post('/api/trade', { side: 'buy', mode: 'amount', value: 1000 })
  check('buy $1,000 fills', r.status === 200 && r.data.transaction.type === 'BUY', r.data)
  const buy = r.data.transaction
  check('fractional quantity = amount / price', Math.abs(buy.shares - Math.floor((1000 / buy.price) * 1e6) / 1e6) < 1e-6, buy)
  r = await cust.get('/api/portfolio')
  const afterBuy = r.data.portfolio
  check('cash debited by amount + fee', Math.abs(afterBuy.cash - (5000 - buy.amount - buy.fee)) < 0.011, { cash: afterBuy.cash, buy })
  check('holding updated', Math.abs(afterBuy.shares - buy.shares) < 1e-6, afterBuy.shares)
  r = await cust.post('/api/trade', { side: 'buy', mode: 'amount', value: 999999 })
  check('buy exceeding cash rejected (422)', r.status === 422, r.status)
  r = await cust.post('/api/trade', { side: 'buy', mode: 'shares', value: 2 })
  check('buy 2 whole shares fills', r.status === 200 && r.data.transaction.shares === 2, r.data)

  // ── 7. Simulated sales ────────────────────────────────────────
  section('7. Simulated sales')
  r = await cust.get('/api/portfolio')
  const held = r.data.portfolio.shares
  const cashBeforeSell = r.data.portfolio.cash
  r = await cust.post('/api/trade', { side: 'sell', mode: 'shares', value: held + 1 })
  check('selling more than held rejected (422)', r.status === 422, r.status)
  r = await cust.post('/api/trade', { side: 'sell', mode: 'shares', value: 1 })
  check('sell 1 share fills', r.status === 200 && r.data.transaction.type === 'SELL', r.data)
  const sell = r.data.transaction
  r = await cust.get('/api/portfolio')
  check('cash credited by proceeds − fee', Math.abs(r.data.portfolio.cash - (cashBeforeSell + sell.amount - sell.fee)) < 0.011, r.data.portfolio.cash)
  check('shares reduced by 1', Math.abs(r.data.portfolio.shares - (held - 1)) < 1e-6, r.data.portfolio.shares)

  // ── 8. Simulated withdrawals ──────────────────────────────────
  section('8. Simulated withdrawals')
  const cashBeforeWd = r.data.portfolio.cash
  r = await cust.post('/api/funding/withdraw', { amount: 1_000_000 })
  check('withdrawal exceeding cash rejected (422)', r.status === 422, r.status)
  r = await cust.post('/api/funding/withdraw', { amount: 500, note: 'E2E reject me' })
  check('withdrawal request created as PENDING', r.status === 200 && r.data.transaction.status === 'PENDING', r.data)
  const wdReject = r.data.transaction
  r = await cust.get('/api/portfolio')
  check('funds reserved immediately', Math.abs(r.data.portfolio.cash - (cashBeforeWd - 500)) < 0.011, r.data.portfolio.cash)
  r = await admin.post(`/api/admin/withdrawals/${wdReject.id}`, { decision: 'reject', note: '' })
  check('rejection requires an admin note (422)', r.status === 422, r.status)
  r = await admin.post(`/api/admin/withdrawals/${wdReject.id}`, { decision: 'reject', note: 'E2E rejection' })
  check('admin rejects withdrawal', r.status === 200 && r.data.transaction.status === 'REJECTED', r.data)
  r = await cust.get('/api/portfolio')
  check('rejected funds returned to cash', Math.abs(r.data.portfolio.cash - cashBeforeWd) < 0.011, r.data.portfolio.cash)
  r = await admin.post(`/api/admin/withdrawals/${wdReject.id}`, { decision: 'approve', note: '' })
  check('cannot re-review a decided withdrawal (409)', r.status === 409, r.status)
  r = await cust.post('/api/funding/withdraw', { amount: 300 })
  const wdApprove = r.data.transaction
  r = await admin.post(`/api/admin/withdrawals/${wdApprove.id}`, { decision: 'approve', note: 'E2E approved' })
  check('admin approves withdrawal', r.status === 200 && r.data.transaction.status === 'COMPLETED' && !!r.data.transaction.brokerRef, r.data)
  r = await cust.post('/api/funding/withdraw', { amount: 50 })
  const wdCancel = r.data.transaction
  r = await cust.post(`/api/funding/withdraw/${wdCancel.id}/cancel`)
  check('customer cancels pending withdrawal', r.status === 200 && r.data.transaction.status === 'CANCELLED', r.data)
  r = await cust.get('/api/portfolio')
  check('balance reflects only the approved withdrawal', Math.abs(r.data.portfolio.cash - (cashBeforeWd - 300)) < 0.011, r.data.portfolio.cash)
  const audit = await prisma.auditLog.findMany({ where: { targetId: { in: [wdReject.id, wdApprove.id] } } })
  check('withdrawal audit trail recorded', audit.some((a) => a.action === 'withdrawal.rejected') && audit.some((a) => a.action === 'withdrawal.approved'), audit.map((a) => a.action))

  // ── 9. Transaction history & statements ───────────────────────
  section('9. Transaction history & statements')
  r = await cust.get('/api/transactions')
  const types = new Set((r.data.rows as { type: string }[]).map((t) => t.type))
  check('history contains deposits, withdrawals, buys and sells', ['DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL'].every((t) => types.has(t)), [...types])
  check('history rows carry references and dates', (r.data.rows as { reference: string; createdAt: string }[]).every((t) => t.reference && t.createdAt))
  check('deposit reference present', (r.data.rows as { reference: string }[]).some((t) => t.reference === depRef))
  r = await cust.get('/api/transactions?type=BUY')
  check('type filter works', r.data.rows.length === 2 && r.data.rows.every((t: { type: string }) => t.type === 'BUY'), r.data.rows.length)
  r = await cust.get(`/api/transactions?q=${wdApprove.reference}`)
  check('reference search works', r.data.rows.length === 1, r.data.rows.length)
  r = await cust.get(`/app/transactions/${buy.id}`)
  check('receipt page renders', r.status === 200, r.status)
  r = await cust.get('/api/statements?kind=summary')
  check('summary statement is a PDF', r.status === 200 && r.headers.get('content-type') === 'application/pdf' && (r.data as Buffer).subarray(0, 4).toString() === '%PDF', r.status)
  r = await cust.get('/api/statements?kind=transactions&from=2020-01-01')
  check('transaction report is a PDF', r.status === 200 && (r.data as Buffer).subarray(0, 4).toString() === '%PDF', r.status)
  const other = await prisma.transaction.findFirst({ where: { userId: { not: user.id } } })
  if (other) {
    r = await cust.get(`/app/transactions/${other.id}`)
    // Streaming responses may already have sent 200 before notFound(); assert no data leaks.
    check("customer cannot view another customer's receipt", (r.status === 404 || r.status === 200) && !String(r.data).includes(other.reference) && /not found/i.test(String(r.data)), r.status)
  }

  // ── 10b. Administrator permissions (RBAC) ─────────────────────
  section('10b. Administrator permissions')
  r = await admin.get(`/api/admin/transactions/export?q=${encodeURIComponent(email)}`)
  check('super admin exports CSV report', r.status === 200 && String(r.headers.get('content-type')).includes('text/csv') && String(r.data).includes('SANDBOX'), r.status)
  r = await admin.req('PUT', '/api/admin/settings/trading', { value: { feeBps: 9999 } })
  check('invalid settings rejected (422)', r.status === 422, r.status)
  const supportEmail = `support.${tag}@test.example`
  r = await admin.post('/api/admin/admins', { email: supportEmail, firstName: 'Sam', lastName: 'Support', role: 'SUPPORT' })
  check('super admin creates SUPPORT admin with temp password', r.status === 200 && typeof r.data.tempPassword === 'string', r.data)
  const support = new Client()
  r = await support.post('/api/admin/auth/login', { email: supportEmail, password: r.data.tempPassword })
  check('support admin signs in', r.status === 200, r.data)
  r = await support.get('/api/admin/customers')
  check('support can read customers', r.status === 200, r.status)
  r = await support.post(`/api/admin/withdrawals/${wdApprove.id}`, { decision: 'approve' })
  check('support cannot review withdrawals (403)', r.status === 403, r.status)
  r = await support.req('PUT', '/api/admin/settings/trading', { value: { feeBps: 5, feeFlat: 0, minOrder: 1, minDeposit: 10, maxDeposit: 250000, minWithdrawal: 25, depositSettlementSeconds: 10 } })
  check('support cannot change settings (403)', r.status === 403, r.status)
  r = await support.post('/api/admin/admins', { email: `x2.${tag}@test.example`, firstName: 'X', lastName: 'Y', role: 'SUPER_ADMIN' })
  check('support cannot create administrators (403)', r.status === 403, r.status)
  r = await support.post(`/api/admin/customers/${user.id}/status`, { action: 'suspend', reason: 'not allowed' })
  check('support cannot suspend customers (403)', r.status === 403, r.status)
  r = await support.get('/api/admin/transactions/export')
  check('support cannot export transactions (403)', r.status === 403, r.status)
  r = await support.get('/admin/settings')
  check('support visiting settings page is redirected', r.status === 307 || r.status === 200 && String(r.data).includes('denied'), r.status)

  // ── Security extras ───────────────────────────────────────────
  section('Security: CSRF, MFA, password reset, rate limiting')
  r = await cust.req('POST', '/api/trade', { side: 'buy', mode: 'amount', value: 10 }, { Origin: 'https://evil.example' })
  check('cross-origin POST blocked (403)', r.status === 403, r.status)
  r = await cust.post('/api/account/mfa/setup')
  const secret = r.data.secret
  check('MFA setup returns secret and QR', r.status === 200 && !!secret && String(r.data.qr).startsWith('data:image/png'), r.status)
  r = await cust.post('/api/account/mfa/enable', { code: '000000' })
  check('wrong MFA code rejected', r.status === 400, r.status)
  r = await cust.post('/api/account/mfa/enable', { code: totpCode(secret) })
  check('MFA enabled with valid TOTP', r.status === 200, r.data)
  await cust.post('/api/auth/logout', { scope: 'customer' })
  r = await cust.post('/api/auth/login', { email, password })
  check('login now requires MFA', r.status === 200 && r.data.mfa === true, r.data)
  r = await cust.get('/api/portfolio')
  check('session unusable before MFA (401)', r.status === 401, r.status)
  r = await cust.post('/api/auth/mfa', { scope: 'customer', code: totpCode(secret) })
  check('MFA code completes sign-in', r.status === 200, r.data)
  r = await cust.get('/api/portfolio')
  check('session usable after MFA', r.status === 200, r.status)
  const anon = new Client()
  r = await anon.post('/api/auth/forgot-password', { email })
  check('password reset request accepted', r.status === 200, r.status)
  const resetToken = await latestEmailLink(email, '/reset-password')
  const newPassword = 'Reset-Passw0rd-' + tag
  r = await anon.post('/api/auth/reset-password', { token: resetToken, password: newPassword })
  check('password reset succeeds', r.status === 200, r.data)
  r = await cust.get('/api/portfolio')
  check('reset revokes existing sessions', r.status === 401, r.status)
  r = await anon.post('/api/auth/login', { email, password: newPassword })
  check('login with new password', r.status === 200 && r.data.mfa === true, r.data)
  const hash = (await prisma.user.findUniqueOrThrow({ where: { email } })).passwordHash
  check('passwords stored as scrypt hashes', hash.startsWith('scrypt$') && !hash.includes(newPassword))
  const rl = new Client()
  let limited = false
  for (let i = 0; i < 8; i++) {
    const x = await rl.post('/api/admin/auth/login', { email: `nobody.${tag}@test.example`, password: 'Nope-nope-123' })
    if (x.status === 429) limited = true
  }
  check('admin login is rate limited (429)', limited)

  console.log(results.join('\n'))
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

main()
  .catch((e) => {
    console.log(results.join('\n'))
    console.error('\nFATAL', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
