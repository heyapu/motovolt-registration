import { PRODUCT_CATALOG } from "@/lib/product-catalog";
import { openBrowser } from "@/lib/server/browser";
import { route } from "@/lib/server/http";
import { limitRead } from "@/lib/server/limits";
import { demoEnabled, required, validateConfiguration } from "@/lib/server/env";
export const GET = route(async request => {
  validateConfiguration();
  const browserId = await openBrowser();
  await limitRead(request, browserId);
  return { browserId, products: PRODUCT_CATALOG.map(({id,name}) => ({id,name})), demo: demoEnabled(), turnstileSiteKey: demoEnabled() ? null : required("TURNSTILE_SITE_KEY") };
});
