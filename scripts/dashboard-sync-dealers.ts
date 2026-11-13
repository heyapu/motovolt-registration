// Kept as a compatibility notice for older handover instructions.
// The database trigger now keeps analytics locations synchronized automatically.
console.error("Dealer records now live in Supabase. Use /dealers with the dashboard passcode; no TypeScript-to-SQL sync is needed.");
process.exitCode = 1;
export {};
