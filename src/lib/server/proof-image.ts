import sharp from "sharp";
import { createHash } from "node:crypto";
import { AppError } from "./errors";
export const MAX_PROOF_INPUT = 2 * 1024 * 1024;
export async function processProofImage(input: Buffer) {
  if (!input.length || input.length > MAX_PROOF_INPUT) throw new AppError("INVALID_IMAGE", "Choose an image smaller than 2 MB after resizing.", 400);
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1)
      throw new Error("Unsupported image");
    const { data, info } = await image.rotate().resize({ width: 500, height: 500, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (info.width > 500 || info.height > 500 || data.length > 1024 * 1024) throw new Error("Image too large");
    return { data, width: info.width, height: info.height, byteSize: data.length, digest: createHash("sha256").update(data).digest("hex") };
  } catch { throw new AppError("INVALID_IMAGE", "Use a valid, still JPG, PNG or WebP image.", 400); }
}
