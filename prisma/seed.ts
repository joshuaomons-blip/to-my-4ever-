/**
 * Demo seed — creates clearly labeled SAMPLE customers and SIMULATED transactions.
 *
 *   npm run db:seed            # adds demo data if none exists
 *   npm run db:seed -- --reset # removes previous demo data first
 *
 * It never creates administrators. Create the first super admin via /admin/setup
 * (guarded by ADMIN_SETUP_TOKEN) or `npm run admin:create`.
 *
 * Demo customer password: SEED_CUSTOMER_PASSWORD if set, otherwise a random one
 * printed once at the end.
 */
import { Prisma, PrismaClient, type KycStatus } from '@prisma/client'
import { randomBytes, scrypt } from 'node:crypto'
import { priceAt } from '../src/lib/market-sim'

const prisma = new PrismaClient()
const D = (n: number, dp = 2) => new Prisma.Decimal(n.toFixed(dp))
const DAY = 86_400_000

function hash(password: string) {
  const salt = randomBytes(16)
  return new Promise<string>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(['scrypt', 2 ** 15, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$')),
    ),
  )
}

let refCounter = 0
const ref = (p: string) => `DEMO-${p}-${String(++refCounter).padStart(5, '0')}${randomBytes(2).toString('hex').toUpperCase()}`

type Plan = {
  first: string
  last: string
  kyc: KycStatus
  country: string
  joinedDaysAgo: number
  status?: 'SUSPENDED'
  flag?: string
  verified?: boolean
  // [daysAgo, kind, value]  kind: dep | buy (usd) | sell (fraction of holding) | wdl | wdlPending
  events: [number, 'dep' | 'buy' | 'sell' | 'wdl' | 'wdlPending', number][]
}

const PLANS: Plan[] = [
  { first: 'Ava', last: 'Chen', kyc: 'APPROVED', country: 'United States', joinedDaysAgo: 320, events: [[318, 'dep', 25000], [316, 'buy', 12000], [240, 'buy', 6000], [200, 'dep', 10000], [150, 'sell', 0.25], [90, 'buy', 8000], [40, 'wdl', 2500], [6, 'buy', 3000]] },
  { first: 'Marcus', last: 'Okafor', kyc: 'APPROVED', country: 'United Kingdom', joinedDaysAgo: 210, events: [[208, 'dep', 15000], [207, 'buy', 9000], [120, 'dep', 5000], [119, 'buy', 6000], [30, 'sell', 0.4], [3, 'wdlPending', 1800]] },
  { first: 'Sofia', last: 'Lindqvist', kyc: 'APPROVED', country: 'Germany', joinedDaysAgo: 180, events: [[179, 'dep', 50000], [178, 'buy', 30000], [100, 'buy', 10000], [12, 'sell', 0.15], [1, 'wdlPending', 4200]] },
  { first: 'Daniel', last: 'Reyes', kyc: 'PENDING', country: 'Canada', joinedDaysAgo: 4, events: [[3, 'dep', 2500]] },
  { first: 'Priya', last: 'Raman', kyc: 'PENDING', country: 'Singapore', joinedDaysAgo: 2, events: [[1, 'dep', 7500]] },
  { first: 'Lucas', last: 'Moreau', kyc: 'REJECTED', country: 'France', joinedDaysAgo: 25, events: [[24, 'dep', 1000]] },
  { first: 'Hannah', last: 'Weiss', kyc: 'APPROVED', country: 'Netherlands', joinedDaysAgo: 400, flag: 'Rapid deposit/withdrawal cycling in sandbox — review pattern.', events: [[398, 'dep', 20000], [397, 'buy', 15000], [300, 'sell', 0.5], [299, 'wdl', 9000], [200, 'dep', 20000], [199, 'buy', 18000], [60, 'sell', 0.6], [59, 'wdl', 10000], [5, 'wdlPending', 3500]] },
  { first: 'Kenji', last: 'Tanaka', kyc: 'APPROVED', country: 'Japan', joinedDaysAgo: 140, events: [[139, 'dep', 12000], [138, 'buy', 4000], [110, 'buy', 4000], [80, 'buy', 3000], [20, 'buy', 500]] },
  { first: 'Olivia', last: 'Grant', kyc: 'NOT_STARTED', country: 'United States', joinedDaysAgo: 1, verified: false, events: [] },
  { first: 'Ethan', last: 'Brooks', kyc: 'APPROVED', country: 'Australia', joinedDaysAgo: 260, status: 'SUSPENDED', events: [[258, 'dep', 8000], [257, 'buy', 7000], [10, 'sell', 1]] },
  { first: 'Amara', last: 'Nwosu', kyc: 'APPROVED', country: 'United States', joinedDaysAgo: 75, events: [[74, 'dep', 3000], [73, 'buy', 1500], [45, 'dep', 1000], [44, 'buy', 1200], [8, 'wdl', 300]] },
  { first: 'Mateo', last: 'Silva', kyc: 'PENDING', country: 'Other', joinedDaysAgo: 6, events: [[5, 'dep', 600]] },
]

async function main() {
  const reset = process.argv.includes('--reset')
  const existing = await prisma.user.count({ where: { isSeed: true } })
  if (existing && !reset) {
    console.log(`Demo data already present (${existing} sample customers). Use --reset to recreate.`)
    return
  }
  if (reset) {
    const { count } = await prisma.user.deleteMany({ where: { isSeed: true } })
    console.log(`Removed ${count} sample customers.`)
  }

  const password = process.env.SEED_CUSTOMER_PASSWORD || `Demo-${randomBytes(6).toString('base64url')}9a`
  const passwordHash = await hash(password)
  const now = Date.now()

  for (const [i, plan] of PLANS.entries()) {
    const email = `${plan.first}.${plan.last}`.toLowerCase() + '@demo.example'
    const joined = new Date(now - plan.joinedDaysAgo * DAY)
    const user = await prisma.user.create({
      data: {
        email,
        firstName: plan.first,
        lastName: plan.last,
        passwordHash,
        isSeed: true,
        emailVerifiedAt: plan.verified === false ? null : new Date(joined.getTime() + 600_000),
        status: plan.status ?? 'ACTIVE',
        suspendedReason: plan.status ? 'Demo: account suspended pending review of chargeback simulation.' : null,
        flagged: !!plan.flag,
        flagReason: plan.flag ?? null,
        createdAt: joined,
        lastLoginAt: new Date(now - Math.min(plan.joinedDaysAgo, (i % 5) + 1) * DAY),
        phone: i % 3 === 0 ? `+1 555 01${String(10 + i)}` : null,
      },
    })

    const submitted = plan.kyc === 'NOT_STARTED' ? null : new Date(joined.getTime() + 3600_000)
    await prisma.kycSubmission.create({
      data: {
        userId: user.id,
        status: plan.kyc,
        ...(plan.kyc !== 'NOT_STARTED' && {
          legalName: `${plan.first} ${plan.last}`,
          dateOfBirth: new Date(Date.UTC(1975 + ((i * 7) % 25), i % 12, 3 + i)),
          country: plan.country,
          addressLine1: `${100 + i * 17} Sample Street`,
          city: 'Demo City',
          postalCode: `${10000 + i * 311}`,
          documentType: i % 2 ? 'Passport' : "Driver's licence",
          occupation: ['Engineer', 'Designer', 'Teacher', 'Analyst', 'Nurse', 'Founder'][i % 6],
          sourceOfFunds: 'Employment income',
          submittedAt: submitted,
        }),
        ...(plan.kyc === 'APPROVED' || plan.kyc === 'REJECTED'
          ? {
              reviewedAt: new Date(joined.getTime() + 6 * 3600_000),
              decisionReason: plan.kyc === 'REJECTED' ? 'Demo: name on submission did not match account name.' : null,
            }
          : {}),
      },
    })

    let cash = 0
    let shares = 0
    let cost = 0
    const txs: Prisma.TransactionCreateManyInput[] = []
    const depositRows: { reference: string; method: 'CARD' | 'BANK_TRANSFER'; amount: number; at: Date }[] = []
    for (const [daysAgo, kind, value] of plan.events) {
      const at = new Date(now - daysAgo * DAY + (i % 7) * 3600_000)
      const base = { userId: user.id, isSeed: true, createdAt: at, brokerMode: 'sandbox' }
      if (kind === 'dep') {
        cash += value
        const reference = ref('DEP')
        const method = daysAgo % 2 ? 'CARD' : 'BANK_TRANSFER'
        txs.push({ ...base, reference, type: 'DEPOSIT', status: 'COMPLETED', amount: D(value), method: `${method === 'CARD' ? 'Card payment' : 'Bank transfer'} · test provider`, completedAt: at, brokerRef: `py_test_demo${i}${daysAgo}`, brokerMode: 'test' })
        depositRows.push({ reference, method, amount: value, at })
      } else if (kind === 'buy') {
        const price = Math.round(priceAt(at.getTime()) * 100) / 100
        const amount = Math.min(value, cash / 1.001)
        const qty = Math.floor((amount / price) * 1e6) / 1e6
        const gross = Math.round(qty * price * 100) / 100
        const fee = Math.round(gross * 0.001 * 100) / 100
        cash -= gross + fee
        shares += qty
        cost += gross + fee
        txs.push({ ...base, reference: ref('BUY'), type: 'BUY', status: 'COMPLETED', symbol: 'TSLA', amount: D(gross), fee: D(fee), shares: D(qty, 6), price: D(price, 4), completedAt: at, brokerRef: `SBX-ORD-DEMO${i}${daysAgo}` })
      } else if (kind === 'sell') {
        const price = Math.round(priceAt(at.getTime()) * 100) / 100
        const qty = Math.floor(shares * value * 1e6) / 1e6
        if (qty <= 0) continue
        const gross = Math.round(qty * price * 100) / 100
        const fee = Math.round(gross * 0.001 * 100) / 100
        cost -= qty === shares ? cost : (cost * qty) / shares
        shares -= qty
        cash += gross - fee
        txs.push({ ...base, reference: ref('SEL'), type: 'SELL', status: 'COMPLETED', symbol: 'TSLA', amount: D(gross), fee: D(fee), shares: D(qty, 6), price: D(price, 4), completedAt: at, brokerRef: `SBX-ORD-DEMO${i}${daysAgo}` })
      } else {
        const amount = Math.min(value, Math.floor(cash))
        if (amount <= 0) continue
        cash -= amount
        const pending = kind === 'wdlPending'
        txs.push({
          ...base,
          reference: ref('WDL'),
          type: 'WITHDRAWAL',
          status: pending ? 'PENDING' : 'COMPLETED',
          amount: D(amount),
          method: 'Simulated bank transfer',
          customerNote: pending ? 'Demo withdrawal request' : null,
          completedAt: pending ? null : new Date(at.getTime() + 4 * 3600_000),
          reviewedAt: pending ? null : new Date(at.getTime() + 4 * 3600_000),
          adminNote: pending ? null : 'Demo: approved automatically by seed',
          brokerRef: pending ? null : `SBX-WDL-DEMO${i}${daysAgo}`,
        })
      }
    }
    await prisma.transaction.createMany({ data: txs })
    // Each completed demo deposit is backed by a SUCCEEDED deposit request linked to its ledger entry.
    for (const d of depositRows) {
      const tx = await prisma.transaction.findUniqueOrThrow({ where: { reference: d.reference } })
      await prisma.depositRequest.create({
        data: {
          reference: d.reference,
          userId: user.id,
          provider: 'test',
          method: d.method,
          amount: D(d.amount),
          receivedAmount: D(d.amount),
          status: 'SUCCEEDED',
          idempotencyKey: `seed-${d.reference}`,
          providerSessionId: `cs_test_demo_${d.reference}`,
          providerPaymentId: `py_test_demo_${d.reference}`,
          transactionId: tx.id,
          isSeed: true,
          expiresAt: new Date(d.at.getTime() + 3600_000),
          succeededAt: d.at,
          createdAt: new Date(d.at.getTime() - 600_000),
        },
      })
    }
    if (plan.first === 'Daniel') {
      await prisma.depositRequest.create({
        data: {
          reference: ref('DEP'),
          userId: user.id,
          provider: 'test',
          method: 'BANK_TRANSFER',
          amount: D(1500),
          status: 'AWAITING_PAYMENT',
          idempotencyKey: `seed-open-${user.id}`,
          providerSessionId: `cs_test_demo_open_${user.id}`,
          instructions: { 'Account name': 'TEST MODE — do not send money', Bank: 'Test Bank (simulated)', 'Account number': '000123456789', 'Routing number': '110000000' },
          isSeed: true,
          expiresAt: new Date(now + 6 * DAY),
        },
      })
    }
    if (plan.first === 'Marcus') {
      await prisma.supportTicket.create({
        data: {
          reference: ref('SUP'),
          userId: user.id,
          subject: 'When will my withdrawal be reviewed?',
          category: 'Withdrawals',
          createdAt: new Date(now - 2 * DAY),
          messages: { create: [{ authorId: user.id, body: 'Hi, I requested a withdrawal a few days ago and it still shows as pending. Is there anything I need to do?', createdAt: new Date(now - 2 * DAY) }] },
        },
      })
    }
    await prisma.account.create({
      data: {
        userId: user.id,
        accountNumber: `SBX${String(90_000_000 + i * 1_337).padStart(8, '0')}`,
        cashBalance: D(Math.max(0, cash)),
        holdings: shares > 0 ? { create: { symbol: 'TSLA', shares: D(shares, 6), costBasis: D(Math.max(0, cost)) } } : undefined,
      },
    })
    await prisma.notification.create({
      data: { userId: user.id, title: 'Demo account', body: 'This is a sample customer created by the seed script. All activity is simulated.', level: 'info', createdAt: joined },
    })
    if (plan.flag) {
      await prisma.adminNote.create({ data: { subjectId: user.id, context: 'customer', body: `[flagged] ${plan.flag}`, createdAt: new Date(now - 2 * DAY) } })
    }
    await prisma.auditLog.create({ data: { actorId: user.id, actorEmail: email, action: 'customer.registered', targetType: 'user', targetId: user.id, metadata: { seed: true }, createdAt: joined } })
  }

  if ((await prisma.faq.count()) === 0) {
    await prisma.faq.createMany({
      data: [
        { sortOrder: 1, question: 'Is my money real?', answer: 'In test mode, no: payments run through a test provider and every balance is simulated. When live payments are switched on, deposits are processed by a regulated payment provider and added to your balance only after the provider confirms them.' },
        { sortOrder: 2, question: 'Am I buying real Tesla shares?', answer: 'No. TSLA orders are filled by a simulated broker at a simulated price. No shares are bought on any exchange and no ownership is conferred.' },
        { sortOrder: 3, question: 'Is this platform affiliated with Tesla, Inc.?', answer: 'No. It is an independent platform and is not endorsed by, affiliated with, or operated by Tesla, Inc.' },
        { sortOrder: 4, question: 'Why do I need to verify my identity?', answer: 'We verify every customer before money can move, as regulated financial services must. We never ask you to upload ID numbers or document photos through this website.' },
        { sortOrder: 5, question: 'How do fractional shares work?', answer: 'Enter a dollar amount and we calculate a fractional quantity, up to six decimal places, at the current simulated price.' },
        { sortOrder: 6, question: 'How long do deposits and withdrawals take?', answer: 'Card payments are usually confirmed within a minute and bank transfers within one to three business days. Your balance changes only after the payment provider confirms the payment. Withdrawals are reviewed by our team before they are paid out.' },
      ],
    })
  }
  if ((await prisma.announcement.count()) === 0) {
    await prisma.announcement.create({
      data: { title: 'Welcome', body: 'Research TSLA, add funds and practise trading in your simulated portfolio. The platform is currently in test mode.', level: 'info', active: true },
    })
  }

  console.log(`✔ Seeded ${PLANS.length} sample customers (emails end with @demo.example).`)
  console.log(`  Demo customer password: ${password}`)
  console.log('  No administrator was created. Use /admin/setup or `npm run admin:create`.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
