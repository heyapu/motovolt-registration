import { resumeSchema } from "@/lib/validation";
import { requireBrowser } from "@/lib/server/browser";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { limitRead } from "@/lib/server/limits";
import { rpc } from "@/lib/server/database";
export const POST = route(async (request) => {
  checkOrigin(request);
  const browserId = await requireBrowser();
  const { phone } = await readJson(request, resumeSchema);
  await limitRead(request, browserId);
  return {
    verification: await rpc("form_resume_verification", {
      p_browser_id: browserId,
      p_phone: phone,
    }),
  };
});
