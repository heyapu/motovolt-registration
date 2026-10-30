import 'server-only';
import { Redis } from '@upstash/redis';
import { demoEnabled, required } from './env';
import { privateKey } from './crypto';
import { rpc } from './database';
import { purchasePeriod } from '../purchase-period';
import type { PurchaseStatus } from '../types';

const client = () => new Redis({ url: required('UPSTASH_REDIS_REST_URL'), token: required('UPSTASH_REDIS_REST_TOKEN'), retry: { retries: 0 }, signal: AbortSignal.timeout(2000) });
const key = (phone: string) => `{motovolt-public}:purchases:${purchasePeriod().key}:${privateKey(phone)}`;
function valid(value: unknown): value is PurchaseStatus {
  const v = value as PurchaseStatus | null;
  return Boolean(v && Number.isSafeInteger(v.count) && v.count >= 0 && v.limit === 5 &&
    v.remaining === Math.max(0,5-v.count) && Date.parse(v.resetsAt) === Date.parse(purchasePeriod().resetsAt));
}
export async function cachePurchaseStatus(phone: string, status: PurchaseStatus): Promise<void> {
  if (demoEnabled() || !valid(status)) return;
  try { await client().set(key(phone), status, { ex: 60 }); }
  catch { /* Cache failure cannot undo a committed registration. */ }
}
export async function purchaseStatus(phone: string): Promise<PurchaseStatus> {
  if (!demoEnabled()) {
    try {
      const cached = await client().get<PurchaseStatus>(key(phone));
      if (valid(cached)) return cached;
    } catch { /* Rebuild from confirmed database records if Redis is unavailable. */ }
  }
  const status = await rpc<PurchaseStatus>('form_monthly_purchase_status', { p_phone: phone });
  await cachePurchaseStatus(phone,status);
  return status;
}
// Redis is a short-lived display cache. Admission and counting occur together in SQL.
