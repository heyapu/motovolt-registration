// Run locally with Node.js. No credentials or database connection are needed.
import { randomBytes, scryptSync } from "node:crypto";
const code = randomBytes(18).toString("base64url");
const salt = randomBytes(16);
const hash = scryptSync(code, salt, 32, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
const encoded = `scrypt$32768$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
console.log("\nYour new dashboard access code (save privately):\n" + code);
console.log("\nRun this SQL in Supabase after the dashboard migration:\n");
console.log(`select public.dashboard_set_access_hash('${encoded}');`);
console.log("\nChanging the hash revokes every existing dashboard session.\n");
