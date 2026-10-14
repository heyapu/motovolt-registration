import { fitProofImage } from "../image-sizing";
export async function prepareProofImage(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 8 * 1024 * 1024)
    throw new Error("Choose a JPG, PNG or WebP image up to 8 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Choose an image below 40 megapixels.");
    const size = fitProofImage(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (!blob || blob.type !== "image/webp" || blob.size > 1024 * 1024) reject(new Error("Could not create the WebP image. Try another image or browser."));
      else resolve(blob);
    }, "image/webp", 0.9));
  } finally { bitmap.close(); }
}
