// Image tools via sharp (optional dependency, lazy-loaded).
// Supports: jpg/png/webp/avif/tiff convert, compress, resize, metadata.

let sharpLib = null;
async function getSharp() {
  if (sharpLib) return sharpLib;
  try {
    sharpLib = (await import("sharp")).default;
    return sharpLib;
  } catch {
    throw new Error("Image support requires the optional dependency 'sharp'. Install it in the package that uses subkit-core (npm i sharp).");
  }
}

export async function imageInfo(buffer) {
  const sharp = await getSharp();
  return sharp(buffer).metadata();
}

export async function convertImage(buffer, { format = "webp", quality = 80, width, height, lossless = false } = {}) {
  const sharp = await getSharp();
  let img = sharp(buffer);
  if (width || height) {
    img = img.resize({ width, height, fit: "inside", withoutEnlargement: true });
  }
  const valid = ["jpg", "jpeg", "png", "webp", "avif", "tiff", "gif"];
  const fmt = format.toLowerCase().replace("jpeg", "jpg");
  if (!valid.includes(fmt)) throw new Error(`Unsupported image format: ${format}. Valid: ${valid.join(", ")}`);
  const sharpFmt = fmt === "jpg" ? "jpeg" : fmt;
  img = img.toFormat(sharpFmt, { quality, lossless });
  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  return {
    data,
    format: info.format,
    width: info.width,
    height: info.height,
    size: data.length,
    originalSize: buffer.length,
    savedPct: buffer.length ? Math.round((1 - data.length / buffer.length) * 100) : 0,
  };
}
