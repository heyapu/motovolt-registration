export function purchasePeriod(now = Date.now()): { key: string; startsAt: string; resetsAt: string } {
  const offset = 330 * 60 * 1000;
  const india = new Date(now + offset);
  const year = india.getUTCFullYear(), month = india.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    startsAt: new Date(Date.UTC(year, month, 1) - offset).toISOString(),
    resetsAt: new Date(Date.UTC(year, month + 1, 1) - offset).toISOString(),
  };
}
