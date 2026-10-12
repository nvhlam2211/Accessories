const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { v2: cloudinary } = require("cloudinary");
const { env } = require("../config/env");
const httpError = require("./httpError");
const uploadsDir = path.resolve(__dirname, "../uploads");
const useCloudinary = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

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

  if (useCloudinary) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: "accessories/products",
        public_id: crypto.randomUUID(),
        resource_type: "image",
        format: ext,
      }, (error, result) => {
        if (error) {
          reject(new Error(`Không thể tải ảnh lên Cloudinary: ${error.message}`));
          return;
        }
        if (!result?.secure_url) {
          reject(new Error("Cloudinary không trả về URL ảnh đã tải lên."));
          return;
        }
        resolve(result.secure_url);
      });
      stream.end(bytes);
    });
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(uploadsDir, filename), bytes, { flag: "wx" });
  return `/uploads/${filename}`;
}

async function removeImage(imageUrl) {
  if (imageUrl?.startsWith("/uploads/")) {
    await fs.rm(path.join(uploadsDir, path.basename(imageUrl)), { force: true });
    return;
  }

  if (!useCloudinary || !imageUrl?.startsWith("https://res.cloudinary.com/")) return;
  const url = new URL(imageUrl);
  if (url.hostname !== "res.cloudinary.com") return;
  const uploadPath = url.pathname.split("/image/upload/")[1];
  if (!uploadPath) throw new Error("Không thể xác định public ID ảnh Cloudinary.");
  const publicId = uploadPath
    .replace(/^v\d+\//, "")
    .replace(/\.[^.]+$/, "");
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Không thể xóa ảnh Cloudinary: ${result.result}`);
  }
}

module.exports = { saveImage, removeImage };
