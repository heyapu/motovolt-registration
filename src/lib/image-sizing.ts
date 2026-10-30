export const MAX_PROOF_EDGE = 1080;
export const MAX_PROOF_PIXELS = 64_000_000;

export function fitProofImage(width: number, height: number): { width: number; height: number } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new Error("Invalid image dimensions");
  const scale = Math.min(1, MAX_PROOF_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
