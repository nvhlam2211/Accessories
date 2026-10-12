const express = require("express");
const authRoutes = require("./auth.routes");
const productRoutes = require("./product.routes");
const categoryRoutes = require("./category.routes");
const cartRoutes = require("./cart.routes");
const adminRoutes = require("./admin.routes");
const healthController = require("../controllers/health.controller");

const router = express.Router();

router.get("/health", healthController.health);
router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/cart", cartRoutes);
router.use("/admin", adminRoutes);

module.exports = router;
