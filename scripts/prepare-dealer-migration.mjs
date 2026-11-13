// Optional, one-time import of YOUR CURRENT TS list before replacing src/lib/dealers.ts.
// Run from the existing project's root. No source file is executed.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing ${name} value.`);
  return args[index + 1];
}
const sourcePath = resolve(arg("--source", "src/lib/dealers.ts"));
const migrationPath = resolve(arg("--migration", "supabase/migrations/202611130001_database_dealers.sql"));
const ts = createRequire(resolve("package.json"))("typescript");
const source = ts.createSourceFile(sourcePath, readFileSync(sourcePath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
if (source.parseDiagnostics.length) throw new Error("The source dealer file has TypeScript syntax errors. Import was not written.");
let initializer;
for (const statement of source.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "DEALERS") initializer = declaration.initializer;
    }
  }
}
while (initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer) || ts.isParenthesizedExpression(initializer))) initializer = initializer.expression;
if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error("No literal DEALERS array found. Run this before copying the new src/lib/dealers.ts.");
const dealers = initializer.elements.map(element => {
  if (!ts.isObjectLiteralExpression(element)) throw new Error("Only plain dealer objects are supported; no source code is executed.");
  const dealer = {};
  for (const property of element.properties) {
    if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) || !(ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))) throw new Error("Dealer properties must be literal strings.");
    dealer[property.name.text] = property.initializer.text;
  }
  for (const [key, min, max] of [["id",1,64],["name",2,120],["city",1,100],["state",1,100],["address",0,1000]]) {
    if (typeof dealer[key] !== "string" || dealer[key].trim().length < min || dealer[key].length > max || /[\u0000-\u001f\u007f]/.test(dealer[key])) throw new Error(`Invalid ${key} for dealer ${dealer.id || "unknown"}. Import was not written.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(dealer.id)) throw new Error(`Invalid Dealer ID ${dealer.id}.`);
  return Object.fromEntries(["id","name","city","state","address"].map(key => [key, dealer[key].trim()]));
});
if (!dealers.length || new Set(dealers.map(d => d.id)).size !== dealers.length) throw new Error("Dealer IDs must be unique and the list cannot be empty.");
const marker = "$dealer_seed$";
const migration = readFileSync(migrationPath, "utf8");
const start = migration.indexOf(marker), end = migration.indexOf(marker, start + marker.length);
if (start === -1 || end === -1) throw new Error("Dealer seed section missing in the migration.");
const json = JSON.stringify(dealers);
if (json.includes(marker)) throw new Error("Unexpected seed delimiter in dealer data.");
writeFileSync(migrationPath, migration.slice(0, start + marker.length) + json + migration.slice(end));
console.log(`Prepared migration with ${dealers.length} dealers from ${sourcePath}. Existing Dealer IDs are unchanged.`);
