const multer = require("multer");
const { UniqueConstraintError, ValidationError } = require("sequelize");
const { ZodError } = require("zod");

function notFound(_req, res) {
  res.status(404).json({ error: "Không tìm thấy đường dẫn API." });
}

function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Dữ liệu không hợp lệ." });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error: error.code === "LIMIT_FILE_SIZE" ? "Ảnh không được lớn hơn 5 MB." : "Tệp tải lên không hợp lệ.",
    });
    return;
  }
  if (error instanceof UniqueConstraintError) {
    res.status(409).json({ error: "Dữ liệu đã tồn tại." });
    return;
  }
  if (error instanceof ValidationError) {
    res.status(400).json({ error: error.errors[0]?.message ?? "Dữ liệu không hợp lệ." });
    return;
  }
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    res.status(error.status).json({ error: error.message ?? "Yêu cầu không hợp lệ." });
    return;
  }
  console.error("API error:", error);
  res.status(500).json({ error: "Đã xảy ra lỗi máy chủ." });
}

module.exports = { notFound, errorHandler };
