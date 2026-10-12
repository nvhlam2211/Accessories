const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const { authenticate, requireAdmin, requireSuperAdmin } = require("../middlewares/auth.middleware");
const controller = require("../controllers/admin.controller");

const router = express.Router();

router.use(authenticate, requireAdmin);
router.get("/reports", asyncHandler(controller.getReports));
router.get("/sales", asyncHandler(controller.listSales));
router.post("/sales", asyncHandler(controller.recordSale));
router.post("/sales/reset", requireSuperAdmin, asyncHandler(controller.resetSales));
router.patch("/sales/:id", requireSuperAdmin, asyncHandler(controller.updateSale));
router.post("/sales/:id/void", requireSuperAdmin, asyncHandler(controller.voidSale));
router.get("/accounts", requireSuperAdmin, asyncHandler(controller.listPageAdmins));
router.post("/accounts", requireSuperAdmin, asyncHandler(controller.createPageAdmin));
router.patch("/accounts/:id", requireSuperAdmin, asyncHandler(controller.updatePageAdminNote));
router.delete("/accounts/:id", requireSuperAdmin, asyncHandler(controller.deletePageAdmin));

module.exports = router;
