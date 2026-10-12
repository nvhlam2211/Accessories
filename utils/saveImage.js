const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const httpError = require("./httpError");
const uploadsDir = path.resolve(__dirname, "../uploads");

async function saveImage(file) {
  if (!file) return undefined;
  const bytes = file.buffer;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8
    && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = bytes.length >= 12
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP";
  const ext = isJpeg ? "jpg" : isPng ? "png" : isWebp ? "webp" : undefined;
  if (!ext) throw httpError(400, "Ảnh phải có định dạng JPG, PNG hoặc WebP.");

  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(uploadsDir, filename), bytes, { flag: "wx" });
  return `/uploads/${filename}`;
}

async function removeImage(imageUrl) {
  if (!imageUrl?.startsWith("/uploads/")) return;
  await fs.rm(path.join(uploadsDir, path.basename(imageUrl)), { force: true });
}

module.exports = { saveImage, removeImage };
