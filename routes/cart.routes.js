const express = require("express");
const asyncHandler = require("../middlewares/asyncHandler");
const { authenticate } = require("../middlewares/auth.middleware");
const controller = require("../controllers/cart.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", asyncHandler(controller.listCart));
router.post("/items", asyncHandler(controller.addCartItem));
router.patch("/items/:id", asyncHandler(controller.updateCartItem));
router.delete("/items/:id", asyncHandler(controller.deleteCartItem));

module.exports = router;
