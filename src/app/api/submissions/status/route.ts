import { z } from "zod";
import { requireBrowser } from "@/lib/server/browser";
import { checkOrigin, readJson, route } from "@/lib/server/http";
import { limitRead } from "@/lib/server/limits";
import { rpc } from "@/lib/server/database";
export const POST = route(async (request) => {
  checkOrigin(request);
  const browserId = await requireBrowser();
  const { requestId } = await readJson(
    request,
    z.object({ requestId: z.uuid() }).strict(),
  );
  await limitRead(request, browserId);
  return {
    receipt: await rpc("form_get_submission", {
      p_browser_id: browserId,
      p_request_id: requestId,
    }),
  };
});
