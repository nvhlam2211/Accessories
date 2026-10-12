const { Op, fn, col } = require("sequelize");
const { z } = require("zod");
const { Product, Category, Sale } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { saveImage, removeImage } = require("../utils/saveImage");
const httpError = require("../utils/httpError");

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).max(5000),
  price: z.coerce.number().positive().max(99999999.99),
  discountPercent: z.preprocess(
    value => value === "" || value === undefined ? null : value,
    z.coerce.number().gt(0).lt(100).nullable(),
  ).optional(),
  stock: z.coerce.number().int().min(0).max(100000),
  categoryId: z.preprocess(value => value === "" || value === undefined ? null : value,
    z.coerce.number().int().positive().nullable()).optional(),
  active: z.preprocess(value => value === undefined ? true : value,
    z.union([z.boolean(), z.string().transform(value => value === "true")])),
});

function categoryInclude() {
  return { model: Category, as: "category", attributes: ["id", "name", "slug"] };
}

function productIdParam(params) {
  return z.coerce.number().int().positive().parse(params.id);
}

function productFilter(query, includeInactive = false) {
  const where = { stock: { [Op.gt]: 0 } };
  if (!includeInactive) where.active = true;
  if (query.categoryId) where.categoryId = Number(query.categoryId);
  if (query.category === "sale") {
    where[Op.and] = [{ discountPercent: { [Op.gt]: 0, [Op.lt]: 100 } }];
  }
  if (query.search?.trim()) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${query.search.trim()}%` } },
      { description: { [Op.iLike]: `%${query.search.trim()}%` } },
    ];
  }
  return where;
}

async function listProducts(req, res) {
  const { page, limit, offset } = getPagination(req.query, 100);
  const result = await Product.findAndCountAll({
    where: productFilter(req.query, req.includeInactive === true),
    include: [categoryInclude()],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });
  res.json({ data: result.rows, meta: paginationMeta(page, limit, result.count) });
}

async function listBestSellers(req, res) {
  const sales = await Sale.findAll({
    attributes: ["productId", [fn("SUM", col("quantity")), "unitsSold"]],
    where: { status: "COMPLETED", productId: { [Op.not]: null } },
    group: ["productId"],
    order: [[fn("SUM", col("quantity")), "DESC"], ["productId", "ASC"]],
    limit: 30,
    raw: true,
  });
  const rankedIds = sales.map(sale => Number(sale.productId));
  if (!rankedIds.length) return res.json({ data: [] });

  const products = await Product.findAll({
    where: { id: { [Op.in]: rankedIds }, active: true, stock: { [Op.gt]: 0 } },
    include: [categoryInclude()],
  });
  const productsById = new Map(products.map(product => [product.id, product]));
  res.json({ data: rankedIds.map(id => productsById.get(id)).filter(Boolean).slice(0, 3) });
}

async function getProduct(req, res) {
  const id = productIdParam(req.params);
  const product = await Product.findOne({
    where: { id, active: true, stock: { [Op.gt]: 0 } },
    include: [categoryInclude()],
  });
  if (!product) throw httpError(404, "Không tìm thấy sản phẩm.");
  res.json({ data: product });
}

async function createProduct(req, res) {
  const input = productSchema.parse(req.body);
  if (input.stock === 0) throw httpError(400, "Số lượng tồn kho phải lớn hơn 0.");
  if (!req.file) throw httpError(400, "Vui lòng chọn ảnh sản phẩm.");
  if (input.categoryId && !await Category.findByPk(input.categoryId)) {
    throw httpError(400, "Danh mục sản phẩm không tồn tại.");
  }

  const imageUrl = await saveImage(req.file);
  try {
    const product = await Product.create({ ...input, imageUrl });
    const result = await Product.findByPk(product.id, { include: [categoryInclude()] });
    res.status(201).location(`/api/products/${product.id}`).json({ data: result });
  } catch (error) {
    await removeImage(imageUrl);
    throw error;
  }
}

async function updateProduct(req, res) {
  const input = productSchema.partial().parse(req.body);
  const product = await Product.findByPk(productIdParam(req.params));
  if (!product) throw httpError(404, "Không tìm thấy sản phẩm.");
  if (input.categoryId && !await Category.findByPk(input.categoryId)) {
    throw httpError(400, "Danh mục sản phẩm không tồn tại.");
  }

  const oldImageUrl = product.imageUrl;
  const newImageUrl = await saveImage(req.file);
  try {
    if (input.stock === 0 || (input.stock === undefined && product.stock === 0)) {
      await product.destroy();
      if (newImageUrl) await removeImage(newImageUrl);
      await removeImage(oldImageUrl);
      return res.json({ data: null, productRemoved: true });
    }
    await product.update({ ...input, ...(newImageUrl ? { imageUrl: newImageUrl } : {}) });
  } catch (error) {
    if (newImageUrl) await removeImage(newImageUrl);
    throw error;
  }
  if (newImageUrl) await removeImage(oldImageUrl);
  const result = await Product.findByPk(product.id, { include: [categoryInclude()] });
  res.json({ data: result, productRemoved: false });
}

async function deleteProduct(req, res) {
  const product = await Product.findByPk(productIdParam(req.params));
  if (!product) throw httpError(404, "Không tìm thấy sản phẩm.");
  const imageUrl = product.imageUrl;
  await product.destroy();
  await removeImage(imageUrl);
  res.status(204).end();
}

module.exports = { listProducts, listBestSellers, getProduct, createProduct, updateProduct, deleteProduct };
