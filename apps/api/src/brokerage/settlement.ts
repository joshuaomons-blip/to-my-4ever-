/** T+N business-day settlement date (weekends skipped; exchange holidays must come from the partner calendar). */
export function settlementDate(executedAt: Date, businessDays = 1): string {
  const d = new Date(Date.UTC(executedAt.getUTCFullYear(), executedAt.getUTCMonth(), executedAt.getUTCDate()));
  let added = 0;
  while (added < businessDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}
