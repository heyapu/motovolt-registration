import { route } from "@/lib/server/http";
import { demoEnabled } from "@/lib/server/env";
export const GET = route(async () => ({ demo: demoEnabled() }));
