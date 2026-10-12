const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const { authenticate, requireAdmin } = require("../middlewares/auth.middleware");
const { uploadImage } = require("../middlewares/upload.middleware");
const controller = require("../controllers/product.controller");

const router = express.Router();

router.get("/", (req, res, next) => {
  if (req.query.includeInactive !== "true") return next();
  authenticate(req, res, error => {
    if (error) return next(error);
    requireAdmin(req, res, error => {
      if (error) return next(error);
      req.includeInactive = true;
      next();
    });
  });
}, asyncHandler(controller.listProducts));
router.get("/best-sellers", asyncHandler(controller.listBestSellers));
router.get("/:id", asyncHandler(controller.getProduct));
router.post("/", authenticate, requireAdmin, uploadImage, asyncHandler(controller.createProduct));
router.patch("/:id", authenticate, requireAdmin, uploadImage, asyncHandler(controller.updateProduct));
router.put("/:id", authenticate, requireAdmin, uploadImage, asyncHandler(controller.updateProduct));
router.delete("/:id", authenticate, requireAdmin, asyncHandler(controller.deleteProduct));

module.exports = router;
