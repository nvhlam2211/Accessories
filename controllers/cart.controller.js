const { z } = require("zod");
const { sequelize, CartItem, Product, Category } = require("../models");
const httpError = require("../utils/httpError");

const productInclude = [{ model: Category, as: "category", attributes: ["id", "name", "slug"] }];

async function listCart(req, res) {
  const items = await CartItem.findAll({
    where: { userId: req.auth.sub },
    include: [{ model: Product, as: "product", include: productInclude }],
    order: [["createdAt", "DESC"]],
  });
  res.json({ data: items });
}

async function addCartItem(req, res) {
  const { productId, quantity } = z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1).max(100),
  }).parse(req.body);

  const result = await sequelize.transaction(async transaction => {
    const product = await Product.findOne({
      where: { id: productId, active: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!product) throw httpError(404, "Không tìm thấy sản phẩm.");

    const [item, created] = await CartItem.findOrCreate({
      where: { userId: req.auth.sub, productId },
      defaults: { userId: req.auth.sub, productId, quantity },
      transaction,
    });
    const nextQuantity = created ? quantity : item.quantity + quantity;
    if (nextQuantity > product.stock) {
      throw httpError(400, `Hiện tại shop chỉ còn ${product.stock} sản phẩm.`);
    }
    if (!created) await item.update({ quantity: nextQuantity }, { transaction });

    return CartItem.findByPk(item.id, {
      include: [{ model: Product, as: "product", include: productInclude }],
      transaction,
    });
  });
  res.status(201).json({ data: result });
}

async function updateCartItem(req, res) {
  const { quantity } = z.object({
    quantity: z.coerce.number().int().min(1).max(100),
  }).parse(req.body);
  const item = await CartItem.findOne({
    where: { id: req.params.id, userId: req.auth.sub },
    include: [{ model: Product, as: "product" }],
  });
  if (!item) throw httpError(404, "Không tìm thấy sản phẩm trong giỏ.");
  if (quantity > item.product.stock) {
    throw httpError(400, `Hiện tại shop chỉ còn ${item.product.stock} sản phẩm.`);
  }
  await item.update({ quantity });
  const result = await CartItem.findByPk(item.id, {
    include: [{ model: Product, as: "product", include: productInclude }],
  });
  res.json({ data: result });
}

async function deleteCartItem(req, res) {
  const deleted = await CartItem.destroy({
    where: { id: req.params.id, userId: req.auth.sub },
  });
  if (!deleted) throw httpError(404, "Không tìm thấy sản phẩm trong giỏ.");
  res.status(204).end();
}

module.exports = { listCart, addCartItem, updateCartItem, deleteCartItem };
