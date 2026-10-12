const { Op, literal } = require("sequelize");
const { z } = require("zod");
const { Category, Product } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");
const httpError = require("../utils/httpError");

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).optional().nullable(),
  active: z.preprocess(value => {
    if (value === undefined) return true;
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }, z.boolean()),
});

async function listCategories(req, res) {
  const { page, limit, offset } = getPagination(req.query, 50);
  const where = req.adminView ? {} : { active: true };
  if (req.query.search?.trim()) where.name = { [Op.iLike]: `%${req.query.search.trim()}%` };
  const result = await Category.findAndCountAll({
    where,
    attributes: {
      include: [[literal('(SELECT COUNT(*) FROM "Product" WHERE "Product"."categoryId" = "Category"."id" AND "Product"."active" = true AND "Product"."stock" > 0)'), "productCount"]],
    },
    order: [["name", "ASC"]],
    limit,
    offset,
  });
  res.json({ data: result.rows, meta: paginationMeta(page, limit, result.count) });
}

async function getCategory(req, res) {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const category = await Category.findOne({
    where: { id, active: true },
    include: [{
      model: Product,
      as: "products",
      where: { active: true, stock: { [Op.gt]: 0 } },
      required: false,
      attributes: ["id", "name"],
    }],
  });
  if (!category) throw httpError(404, "Không tìm thấy danh mục.");
  res.json({ data: category });
}

async function createCategory(req, res) {
  const category = await Category.create(categorySchema.parse(req.body));
  res.status(201).location(`/api/categories/${category.id}`).json({ data: category });
}

async function updateCategory(req, res) {
  const input = categorySchema.partial().parse(req.body);
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const category = await Category.findByPk(id);
  if (!category) throw httpError(404, "Không tìm thấy danh mục.");
  await category.update(input);
  res.json({ data: category });
}

async function deleteCategory(req, res) {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const category = await Category.findByPk(id);
  if (!category) throw httpError(404, "Không tìm thấy danh mục.");
  await category.destroy();
  res.status(204).end();
}

module.exports = { listCategories, getCategory, createCategory, updateCategory, deleteCategory };
