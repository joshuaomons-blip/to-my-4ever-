import 'server-only'
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib'
import { prisma } from '@/server/db'
import { getSettings } from '@/server/settings'
import { paymentsConfig } from '@/server/payments/config'
import { getPortfolio, toTxDTO } from './portfolio'

const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ascii = (s: string) => s.replace(/[^\x20-\x7E]/g, '-')
const day = (d: Date) => d.toISOString().slice(0, 10)

export type StatementKind = 'summary' | 'transactions'

export async function buildStatementPdf(userId: string, opts: { kind: StatementKind; from: Date; to: Date }) {
  const [user, settings, portfolio, txs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    getSettings(),
    getPortfolio(userId),
    prisma.transaction.findMany({ where: { userId, createdAt: { gte: opts.from, lte: opts.to } }, orderBy: { createdAt: 'asc' } }),
  ])
  const rows = txs.map(toTxDTO)
  const live = paymentsConfig().livemode

  const pdf = await PDFDocument.create()
  pdf.setTitle(`${settings.branding.platformName} account statement`)
  pdf.setProducer(settings.branding.platformName)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28
  const H = 841.89
  const M = 48
  const red = rgb(232 / 255, 33 / 255, 39 / 255)
  const ink = rgb(0.06, 0.06, 0.06)
  const grey = rgb(0.45, 0.45, 0.47)

  let page!: PDFPage
  let y = 0
  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = ink) =>
    page.drawText(ascii(s), { x, y: yy, size, font: f, color })
  const right = (s: string, xr: number, yy: number, size = 9, f: PDFFont = font, color = ink) =>
    text(s, xr - f.widthOfTextAtSize(ascii(s), size), yy, size, f, color)

  const newPage = () => {
    page = pdf.addPage([W, H])
    page.drawText(live ? 'SHARE HOLDINGS SIMULATED' : 'TEST MODE - SIMULATED - NO REAL MONEY', {
      x: 95, y: 260, size: 30, font: bold, color: rgb(0.93, 0.93, 0.93), rotate: degrees(35), opacity: 0.6,
    })
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: red })
    text(settings.branding.platformName, M, H - 50, 16, bold)
    right(opts.kind === 'summary' ? 'Portfolio Summary Statement' : 'Transaction Report', W - M, H - 48, 11, bold)
    right(`${day(opts.from)} to ${day(opts.to)}`, W - M, H - 62, 9, font, grey)
    text(live ? 'Cash reflects verified payments. TSLA holdings and orders are simulated.' : 'TEST MODE - payments, balances and trades are simulated', M, H - 66, 8, bold, red)
    page.drawLine({ start: { x: M, y: H - 78 }, end: { x: W - M, y: H - 78 }, thickness: 0.6, color: rgb(0.85, 0.85, 0.85) })
    y = H - 104
  }
  newPage()

  text('Account holder', M, y, 8, font, grey)
  text('Account number', 230, y, 8, font, grey)
  text('Generated', 400, y, 8, font, grey)
  y -= 14
  text(`${user.firstName} ${user.lastName}`, M, y, 10, bold)
  text(portfolio.accountNumber, 230, y, 10, bold)
  text(new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC', 400, y, 10, bold)
  y -= 12
  text(user.email, M, y, 9, font, grey)
  y -= 30

  const kpis: [string, string][] = [
    ['Total portfolio value', money(portfolio.totalValue)],
    ['Available cash', money(portfolio.cash)],
    ['TSLA shares (simulated)', portfolio.shares.toFixed(6)],
    ['TSLA market value', money(portfolio.marketValue)],
    ['Cost basis', money(portfolio.costBasis)],
    ['Unrealized P/L', `${money(portfolio.unrealizedPnl)} (${portfolio.unrealizedPnlPct}%)`],
    ['Net contributions', money(portfolio.netContributions)],
    ['Total P/L', `${money(portfolio.totalPnl)} (${portfolio.totalPnlPct}%)`],
  ]
  const colW = (W - 2 * M) / 4
  kpis.forEach(([label, value], i) => {
    const cx = M + (i % 4) * colW
    const cy = y - Math.floor(i / 4) * 44
    page.drawRectangle({ x: cx, y: cy - 30, width: colW - 8, height: 40, color: rgb(0.965, 0.965, 0.97) })
    text(label, cx + 8, cy - 2, 7.5, font, grey)
    text(value, cx + 8, cy - 18, 10.5, bold)
  })
  y -= 104
  text(`Simulated TSLA price used for valuation: ${money(portfolio.quote.price)} at ${portfolio.quote.asOf.slice(0, 16).replace('T', ' ')} UTC (simulated feed, not market data).`, M, y, 8, font, grey)
  y -= 28

  if (opts.kind === 'summary') {
    const totals = { DEPOSIT: 0, WITHDRAWAL: 0, BUY: 0, SELL: 0, ADJUSTMENT: 0, fees: 0 }
    for (const r of rows) {
      if (r.status !== 'COMPLETED') continue
      totals[r.type] += r.amount
      totals.fees += r.fee
    }
    text('Period activity (completed)', M, y, 11, bold)
    y -= 18
    for (const [label, v] of [
      ['Deposits', totals.DEPOSIT], ['Withdrawals', totals.WITHDRAWAL], ['Purchases (TSLA)', totals.BUY], ['Sales (TSLA)', totals.SELL], ['Balance corrections', totals.ADJUSTMENT], ['Simulated fees', totals.fees],
    ] as [string, number][]) {
      text(label, M, y, 9.5)
      right(money(v), W - M, y, 9.5, bold)
      y -= 6
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: rgb(0.9, 0.9, 0.9) })
      y -= 12
    }
    y -= 14
  }

  text(opts.kind === 'summary' ? 'Transactions in period' : 'Transaction detail', M, y, 11, bold)
  y -= 18
  const cols = [M, M + 62, M + 160, M + 225, M + 290, M + 360, W - M]
  const header = () => {
    ;['Date', 'Reference', 'Type', 'Status', 'Shares', 'Price'].forEach((h, i) => text(h, cols[i], y, 7.5, bold, grey))
    right('Amount', cols[6], y, 7.5, bold, grey)
    y -= 12
  }
  header()
  if (rows.length === 0) {
    text('No transactions in this period.', M, y, 9, font, grey)
    y -= 14
  }
  for (const r of rows) {
    if (y < 80) {
      newPage()
      header()
    }
    text(day(new Date(r.createdAt)), cols[0], y, 8)
    text(r.reference, cols[1], y, 8)
    text(r.type, cols[2], y, 8)
    text(r.status, cols[3], y, 8)
    text(r.shares != null ? r.shares.toFixed(4) : '-', cols[4], y, 8)
    text(r.price != null ? money(r.price) : '-', cols[5], y, 8)
    const signed = r.type === 'DEPOSIT' || r.type === 'SELL' || r.type === 'ADJUSTMENT' ? r.amount : -r.amount
    right(money(signed) + (r.fee ? `  (fee ${money(r.fee)})` : ''), cols[6], y, 8)
    y -= 13
  }

  const pages = pdf.getPages()
  pages.forEach((p, i) => {
    p.drawText(ascii(`This statement is generated by an independent platform not affiliated with Tesla, Inc. TSLA holdings and orders are simulated and confer no ownership of any security.${live ? '' : ' In test mode all payments and balances are simulated and have no cash value.'}  Page ${i + 1} of ${pages.length}`), {
      x: M, y: 30, size: 6.5, font, color: grey, maxWidth: W - 2 * M, lineHeight: 9,
    })
  })
  return pdf.save()
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}
