const multer = require("multer");

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.mimetype)) {
      callback(Object.assign(new Error("Ảnh phải có định dạng JPG, PNG hoặc WebP."), { status: 400 }));
      return;
    }
    callback(null, true);
  },
}).single("image");

module.exports = { uploadImage };
