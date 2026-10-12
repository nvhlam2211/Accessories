const bcrypt = require("bcrypt");
const { Op, fn, col, literal } = require("sequelize");
const { z } = require("zod");
const { sequelize, Product, Sale, SaleAudit, Category, User } = require("../models");
const { env } = require("../config/env");
const httpError = require("../utils/httpError");
const { effectivePrice } = require("../utils/productPrice");

function timezoneOffsetMinutes(timezone) {
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(timezone);
  if (!match) throw new Error(`Múi giờ cơ sở dữ liệu không hợp lệ: ${timezone}`);
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function localDateKey(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function shiftToLocalCalendar(date, offsetMinutes) {
  return new Date(date.getTime() + offsetMinutes * 60_000);
}

function localBoundary(year, month, day, offsetMinutes) {
  return new Date(Date.UTC(year, month, day) - offsetMinutes * 60_000);
}

function saleSnapshot(product) {
  return {
    name: product.name,
    description: product.description,
    price: String(product.price),
    discountPercent: product.discountPercent === null ? null : String(product.discountPercent),
    imageUrl: product.imageUrl,
    active: product.active,
    categoryId: product.categoryId,
  };
}

function saleValues(sale) {
  return {
    productName: sale.productName,
    quantity: sale.quantity,
    unitPrice: String(sale.unitPrice),
    status: sale.status,
  };
}

async function findOrRestoreSaleProduct(sale, transaction) {
  const product = sale.productId
    ? await Product.findByPk(sale.productId, { transaction, lock: transaction.LOCK.UPDATE })
    : null;
  if (product) return product;
  const snapshot = sale.productSnapshot;
  const matchingNameProducts = await Product.findAll({
    where: { name: snapshot?.name ?? sale.productName },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (matchingNameProducts.length === 1) return matchingNameProducts[0];
  if (!sale.productSnapshot) {
    throw httpError(409, matchingNameProducts.length
      ? "Không thể xác định đúng sản phẩm để hoàn kho vì có nhiều sản phẩm trùng tên. Hãy xử lý tồn kho thủ công trước khi hủy giao dịch."
      : "Không thể khôi phục tồn kho: giao dịch cũ chưa lưu thông tin sản phẩm. Hãy thêm lại đúng sản phẩm với cùng tên vào kho trước khi điều chỉnh giao dịch.");
  }

  if (matchingNameProducts.length > 1) {
    const exactMatches = matchingNameProducts.filter(product =>
      product.imageUrl === snapshot.imageUrl && product.description === snapshot.description);
    if (exactMatches.length === 1) return exactMatches[0];
    throw httpError(409, "Không thể xác định duy nhất sản phẩm để hoàn kho vì có nhiều sản phẩm trùng tên. Hãy xử lý tồn kho thủ công trước khi hủy giao dịch.");
  }

  const category = snapshot.categoryId
    ? await Category.findByPk(snapshot.categoryId, { transaction })
    : null;
  return Product.create({
    ...snapshot,
    categoryId: category ? snapshot.categoryId : null,
    stock: 0,
  }, { transaction });
}

async function createSaleAudit(sale, req, transaction, action, reason, before, after) {
  const admin = await User.findByPk(req.auth.sub, {
    attributes: ["name"],
    transaction,
  });
  await SaleAudit.create({
    saleId: sale.id,
    adminId: req.auth.sub,
    adminName: admin?.name ?? null,
    action,
    reason,
    before,
    after,
  }, { transaction });
}

async function recordSale(req, res) {
  const input = z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1).max(100000),
    unitPrice: z.preprocess(value => value === "" || value === undefined ? undefined : value,
      z.coerce.number().positive().max(99999999.99).optional()),
  }).parse(req.body);

  const result = await sequelize.transaction(async transaction => {
    const product = await Product.findByPk(input.productId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!product) throw httpError(404, "Không tìm thấy sản phẩm.");
    if (product.stock < input.quantity) throw httpError(400, "Số lượng bán vượt quá tồn kho.");

    const unitPrice = input.unitPrice ?? effectivePrice(product);
    const remainingStock = product.stock - input.quantity;
    await product.update({ stock: remainingStock }, { transaction });
    const sale = await Sale.create({
      productId: product.id,
      productName: product.name,
      productSnapshot: saleSnapshot(product),
      unitPrice,
      quantity: input.quantity,
    }, { transaction });

    if (remainingStock === 0) {
      await product.destroy({ transaction });
      return { sale, productRemoved: true, remainingStock };
    }
    return { sale, productRemoved: false, remainingStock };
  });

  res.status(201).json({
    data: result.sale,
    productRemoved: result.productRemoved,
    remainingStock: result.remainingStock ?? 0,
  });
}

async function listSales(req, res) {
  const { page, limit } = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  }).parse(req.query);
  const [result, totalCompleted, totalVoided] = await Promise.all([
    Sale.findAndCountAll({
      include: [{
        model: SaleAudit,
        as: "audits",
        attributes: ["id", "action", "reason", "before", "after", "adminId", "adminName", "createdAt"],
      }],
      order: [["soldAt", "DESC"], ["id", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    }),
    Sale.count({ where: { status: "COMPLETED" } }),
    Sale.count({ where: { status: "VOIDED" } }),
  ]);
  const sales = result.rows;
  const adminIds = [...new Set(sales.flatMap(sale => sale.audits.map(audit => audit.adminId)))];
  const admins = adminIds.length
    ? await User.findAll({ where: { id: { [Op.in]: adminIds } }, attributes: ["id", "name"] })
    : [];
  const adminNames = new Map(admins.map(admin => [admin.id, admin.name]));

  res.json({
    data: sales.map(sale => ({
      ...sale.toJSON(),
      audits: sale.audits.map(audit => {
        const { adminId, ...auditData } = audit.toJSON();
        return { ...auditData, adminName: audit.adminName ?? adminNames.get(adminId) ?? null };
      }),
    })),
    meta: {
      page,
      limit,
      total: result.count,
      totalPages: Math.ceil(result.count / limit),
      totalCompleted,
      totalVoided,
    },
  });
}

async function listPageAdmins(_req, res) {
  const admins = await User.findAll({
    where: { role: "ADMIN" },
    attributes: ["id", "name", "email", "ownerNote", "createdAt"],
    order: [["createdAt", "ASC"]],
  });
  res.json({ data: admins });
}

async function createPageAdmin(req, res) {
  const input = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).transform(email => email.toLowerCase()),
    password: z.string().min(8).max(72).refine(
      password => Buffer.byteLength(password, "utf8") <= 72,
      "Mật khẩu không được vượt quá 72 byte.",
    ),
    ownerNote: z.string().trim().min(2).max(200),
  }).parse(req.body);

  if (input.email === env.ADMIN_EMAIL) {
    throw httpError(409, "Email này đang được sử dụng bởi Super Admin.");
  }
  if (await User.findOne({ where: { email: input.email } })) {
    throw httpError(409, "Email này đã có tài khoản.");
  }

  const admin = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
    ownerNote: input.ownerNote,
    role: "ADMIN",
  });
  res.status(201).json({
    data: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      ownerNote: admin.ownerNote,
      role: admin.role,
      createdAt: admin.createdAt,
    },
  });
}

async function updatePageAdminNote(req, res) {
  const { ownerNote } = z.object({
    ownerNote: z.string().trim().min(2).max(200),
  }).parse(req.body);
  const admin = await User.findOne({
    where: { id: req.params.id, role: "ADMIN" },
  });
  if (!admin) throw httpError(404, "Không tìm thấy tài khoản quản trị page.");
  await admin.update({ ownerNote });
  res.json({
    data: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      ownerNote: admin.ownerNote,
      role: admin.role,
      createdAt: admin.createdAt,
    },
  });
}

async function deletePageAdmin(req, res) {
  const result = await sequelize.transaction(async transaction => {
    const admin = await User.findOne({
      where: { id: req.params.id, role: "ADMIN" },
      attributes: ["id", "name"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!admin) throw httpError(404, "Không tìm thấy tài khoản quản trị page.");

    await SaleAudit.update(
      { adminName: admin.name },
      { where: { adminId: admin.id, adminName: null }, transaction },
    );
    await admin.destroy({ transaction });
    return { id: admin.id };
  });
  res.json({ data: result });
}

async function updateSale(req, res) {
  const input = z.object({
    quantity: z.coerce.number().int().min(1).max(100000),
    unitPrice: z.coerce.number().positive().max(99999999.99),
    reason: z.string().trim().min(5).max(500),
  }).parse(req.body);

  const result = await sequelize.transaction(async transaction => {
    const sale = await Sale.findByPk(z.coerce.number().int().positive().parse(req.params.id), {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sale) throw httpError(404, "Không tìm thấy giao dịch.");
    if (sale.status !== "COMPLETED") throw httpError(409, "Giao dịch đã hủy nên không thể chỉnh sửa.");

    const before = saleValues(sale);
    const quantityDifference = sale.quantity - input.quantity;
    let productId = sale.productId;
    if (quantityDifference !== 0) {
      const product = await findOrRestoreSaleProduct(sale, transaction);
      const nextStock = product.stock + quantityDifference;
      if (nextStock < 0) {
        throw httpError(400, "Không đủ tồn kho để tăng số lượng của giao dịch này.");
      }
      if (nextStock === 0) {
        await product.destroy({ transaction });
        productId = null;
      } else {
        await product.update({ stock: nextStock }, { transaction });
        productId = product.id;
      }
    }

    await sale.update({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      productId,
    }, { transaction });
    const after = saleValues(sale);
    await createSaleAudit(sale, req, transaction, "EDIT", input.reason, before, after);
    return sale;
  });

  res.json({ data: result });
}

async function voidSale(req, res) {
  const { reason } = z.object({
    reason: z.string().trim().min(5).max(500),
  }).parse(req.body);

  const result = await sequelize.transaction(async transaction => {
    const sale = await Sale.findByPk(z.coerce.number().int().positive().parse(req.params.id), {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sale) throw httpError(404, "Không tìm thấy giao dịch.");
    if (sale.status !== "COMPLETED") throw httpError(409, "Giao dịch này đã được hủy trước đó.");

    const before = saleValues(sale);
    const product = await findOrRestoreSaleProduct(sale, transaction);
    await product.increment("stock", { by: sale.quantity, transaction });
    await sale.update({
      productId: product.id,
      status: "VOIDED",
      voidedAt: new Date(),
      voidReason: reason,
    }, { transaction });
    const after = saleValues(sale);
    await createSaleAudit(sale, req, transaction, "VOID", reason, before, after);
    return sale;
  });

  res.json({ data: result });
}

async function resetSales(req, res) {
  const { reason } = z.object({
    reason: z.string().trim().min(5).max(500),
  }).parse(req.body);

  const result = await sequelize.transaction(async transaction => {
    const sales = await Sale.findAll({
      where: { status: "COMPLETED" },
      order: [["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    let inventoryRestored = 0;
    let inventoryNotRestored = 0;

    for (const sale of sales) {
      const before = saleValues(sale);
      let product = null;
      try {
        product = await findOrRestoreSaleProduct(sale, transaction);
      } catch (error) {
        if (error.status !== 409) throw error;
      }

      if (product) {
        await product.increment("stock", { by: sale.quantity, transaction });
        inventoryRestored += 1;
      } else {
        inventoryNotRestored += 1;
      }
      const voidReason = product
        ? reason
        : `${reason} (Tồn kho không thể khôi phục: giao dịch cũ thiếu thông tin sản phẩm.)`;
      await sale.update({
        productId: product?.id ?? null,
        status: "VOIDED",
        voidedAt: new Date(),
        voidReason,
      }, { transaction });
      await createSaleAudit(
        sale,
        req,
        transaction,
        "VOID",
        voidReason,
        before,
        { ...saleValues(sale), inventoryRestored: Boolean(product) },
      );
    }
    return { voidedSales: sales.length, inventoryRestored, inventoryNotRestored };
  });

  res.json({ data: result });
}

async function getReports(req, res) {
  const offsetMinutes = timezoneOffsetMinutes(env.DB_TIMEZONE);
  const now = new Date();
  const localNow = shiftToLocalCalendar(now, offsetMinutes);
  const year = localNow.getUTCFullYear();
  const month = localNow.getUTCMonth();
  const today = localDateKey(now, offsetMinutes);
  const startOfYear = localBoundary(year, 0, 1, offsetMinutes);
  const startOfMonth = localBoundary(year, month, 1, offsetMinutes);
  const startOfTomorrow = localBoundary(year, month, localNow.getUTCDate() + 1, offsetMinutes);
  const groupByDay = fn("date_trunc", "day", col("soldAt"));
  const groupByMonth = fn("date_trunc", "month", col("soldAt"));
  const totals = literal('SUM("unitPrice" * "quantity")');

  const [dailyRows, monthlyRows] = await Promise.all([
    Sale.findAll({
      attributes: [[groupByDay, "period"], [totals, "revenue"], [fn("SUM", col("quantity")), "unitsSold"]],
      where: { status: "COMPLETED", soldAt: { [Op.gte]: startOfMonth, [Op.lt]: startOfTomorrow } },
      group: [groupByDay],
      order: [[groupByDay, "ASC"]],
      raw: true,
    }),
    Sale.findAll({
      attributes: [[groupByMonth, "period"], [totals, "revenue"], [fn("SUM", col("quantity")), "unitsSold"]],
      where: { status: "COMPLETED", soldAt: { [Op.gte]: startOfYear, [Op.lt]: startOfTomorrow } },
      group: [groupByMonth],
      order: [[groupByMonth, "ASC"]],
      raw: true,
    }),
  ]);

  const daysElapsed = localNow.getUTCDate();
  const dailyByDate = new Map(dailyRows.map(row => [
    localDateKey(new Date(row.period), offsetMinutes),
    { revenue: Number(row.revenue), unitsSold: Number(row.unitsSold) },
  ]));
  const monthlyByDate = new Map(monthlyRows.map(row => {
    const local = shiftToLocalCalendar(new Date(row.period), offsetMinutes);
    return [String(local.getUTCMonth() + 1).padStart(2, "0"), {
      revenue: Number(row.revenue),
      unitsSold: Number(row.unitsSold),
    }];
  }));

  res.json({
    data: {
      today,
      year,
      month: month + 1,
      todayRevenue: dailyByDate.get(today)?.revenue ?? 0,
      monthRevenue: dailyRows.reduce((sum, row) => sum + Number(row.revenue), 0),
      daily: Array.from({ length: daysElapsed }, (_, index) => {
        const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
        return { date, ...(dailyByDate.get(date) ?? { revenue: 0, unitsSold: 0 }) };
      }),
      monthly: Array.from({ length: month + 1 }, (_, index) => {
        const key = String(index + 1).padStart(2, "0");
        return { month: `${year}-${key}`, ...(monthlyByDate.get(key) ?? { revenue: 0, unitsSold: 0 }) };
      }),
    },
  });
}

module.exports = {
  recordSale,
  listSales,
  listPageAdmins,
  createPageAdmin,
  updatePageAdminNote,
  deletePageAdmin,
  updateSale,
  voidSale,
  resetSales,
  getReports,
};
