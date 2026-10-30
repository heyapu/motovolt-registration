import { z } from 'zod';
import { requireBrowser } from '@/lib/server/browser';
import { checkOrigin, readJson, route } from '@/lib/server/http';
import { limitRead } from '@/lib/server/limits';
import { rpc } from '@/lib/server/database';
import { purchaseStatus } from '@/lib/server/purchases';
import { AppError } from '@/lib/server/errors';
import type { Verification } from '@/lib/types';
export const POST = route(async request => {
  checkOrigin(request);
  const browserId = await requireBrowser();
  const { attemptId } = await readJson(request,z.object({attemptId:z.uuid()}).strict());
  await limitRead(request,browserId);
  const v = await rpc<Verification>('form_load_verification',{p_browser_id:browserId,p_attempt_id:attemptId});
  if (v.status !== 'verified' || Date.parse(v.verificationExpiresAt || '') <= Date.now())
    throw new AppError('VERIFICATION_EXPIRED','Verify this phone number first.',410);
  return { purchaseStatus: await purchaseStatus(v.phone) };
});
