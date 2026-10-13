import { existsSync } from "node:fs";
import { validateConfiguration } from "../src/lib/server/env";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
try {
  validateConfiguration();
  console.log(
    "Configuration is valid. Provider connectivity must still be tested.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid configuration",
  );
  process.exitCode = 1;
}
