const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const { authenticate, requireAdmin, requireSuperAdmin } = require("../middlewares/auth.middleware");
const controller = require("../controllers/category.controller");

const router = express.Router();

router.get("/", (req, res, next) => {
  if (req.query.admin !== "true") return next();
  authenticate(req, res, error => {
    if (error) return next(error);
    requireAdmin(req, res, error => {
      if (error) return next(error);
      req.adminView = true;
      next();
    });
  });
}, controller.listCategories);
router.get("/:id", controller.getCategory);
router.post("/", authenticate, requireSuperAdmin, controller.createCategory);
router.patch("/:id", authenticate, requireSuperAdmin, controller.updateCategory);
router.put("/:id", authenticate, requireSuperAdmin, controller.updateCategory);
router.delete("/:id", authenticate, requireSuperAdmin, controller.deleteCategory);

module.exports = router;
