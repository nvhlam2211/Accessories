const express = require("express");
const rateLimit = require("express-rate-limit");
const asyncHandler = require("../middlewares/asyncHandler");
const { authenticate } = require("../middlewares/auth.middleware");
const controller = require("../controllers/auth.controller");

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.",
  }),
});

router.post("/register", authLimiter, asyncHandler(controller.register));
router.post("/login", authLimiter, asyncHandler(controller.login));
router.post("/google", authLimiter, asyncHandler(controller.googleLogin));
router.get("/me", authenticate, asyncHandler(controller.me));
router.post("/change-password", authenticate, asyncHandler(controller.changePassword));
router.post("/logout", controller.logout);

module.exports = router;
