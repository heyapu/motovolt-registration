import { fitProofImage, MAX_PROOF_PIXELS } from "../image-sizing";

export const MAX_PROOF_ORIGINAL_BYTES = 20 * 1024 * 1024;
// Send only the prepared image to the server, never the 20 MB original.
export const MAX_PROOF_PREPARED_BYTES = 1024 * 1024;

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch {
      // Safari versions may decode via <img> but not createImageBitmap.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let timer: ReturnType<typeof setTimeout>;
    const dispose = () => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      image.src = "";
      URL.revokeObjectURL(url);
    };
    const fail = () => {
      dispose();
      reject(new Error("Could not open this image. Try a JPG, PNG or a screenshot."));
    };
    image.onload = () => {
      clearTimeout(timer);
      if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, dispose });
    };
    image.onerror = fail;
    timer = setTimeout(fail, 30000);
    image.src = url;
  });
}

export async function prepareProofImage(file: File): Promise<Blob> {
  const supported = ["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
  if (!supported || !file.size || file.size > MAX_PROOF_ORIGINAL_BYTES)
    throw new Error("Choose a JPG, PNG or WebP image up to 20 MB.");
  const decoded = await decodeImage(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (decoded.width * decoded.height > MAX_PROOF_PIXELS)
      throw new Error("Choose an image below 64 megapixels.");
    const size = fitProofImage(decoded.width, decoded.height);
    canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(decoded.source, 0, 0, size.width, size.height);
    // Safari does not need to encode WebP. The server stores WebP later.
    for (const quality of [0.9, 0.82, 0.72, 0.6]) {
      const blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size > 0 && blob.type === "image/jpeg" && blob.size <= MAX_PROOF_PREPARED_BYTES)
        return blob;
    }
    throw new Error("Could not compress this image. Try a clear screenshot or a smaller photo.");
  } finally {
    decoded.dispose();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
