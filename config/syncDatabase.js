const { DataTypes, Op, literal } = require("sequelize");
const { sequelize, User, Product, Category, CartItem, Sale, SaleAudit } = require("../models");
const { removeImage } = require("../utils/saveImage");

async function createMissingModel(model, transaction) {
  const tableExists = await sequelize.getQueryInterface().tableExists(model.getTableName(), { transaction });
  if (!tableExists) await model.sync({ transaction });
}

async function migrateProductIds(transaction) {
  const queryInterface = sequelize.getQueryInterface();
  const productColumns = await queryInterface.describeTable("Product", { transaction });
  const cartColumns = await queryInterface.describeTable("CartItem", { transaction });
  const productIdType = String(productColumns.id.type).toUpperCase();
  const cartProductIdType = String(cartColumns.productId.type).toUpperCase();
  const productIdIsInteger = productIdType.startsWith("INTEGER");
  const cartProductIdIsInteger = cartProductIdType.startsWith("INTEGER");

  if (productIdIsInteger && cartProductIdIsInteger) return;
  if (productIdIsInteger || cartProductIdIsInteger) {
    throw new Error("Product IDs and CartItem.productId have incompatible types; refusing an unsafe migration.");
  }
  if (!productIdType.includes("TEXT") || !cartProductIdType.includes("TEXT")) {
    throw new Error(`Unsupported product ID types: Product.id=${productIdType}, CartItem.productId=${cartProductIdType}.`);
  }

  const [foreignKeys] = await sequelize.query(
    `SELECT tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
       AND tc.constraint_schema = ccu.constraint_schema
     WHERE tc.table_schema = current_schema()
       AND tc.table_name = 'CartItem'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND kcu.column_name = 'productId'
       AND ccu.table_name = 'Product'
       AND ccu.column_name = 'id'`,
    { transaction },
  );
  for (const { constraint_name: name } of foreignKeys) {
    await sequelize.query(
      `ALTER TABLE "CartItem" DROP CONSTRAINT ${queryInterface.quoteIdentifier(name)}`,
      { transaction },
    );
  }

  const [primaryKeys] = await sequelize.query(
    `SELECT tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
     WHERE tc.table_schema = current_schema()
       AND tc.table_name = 'Product'
       AND tc.constraint_type = 'PRIMARY KEY'
       AND kcu.column_name = 'id'`,
    { transaction },
  );
  for (const { constraint_name: name } of primaryKeys) {
    await sequelize.query(
      `ALTER TABLE "Product" DROP CONSTRAINT ${queryInterface.quoteIdentifier(name)}`,
      { transaction },
    );
  }

  await sequelize.query('ALTER TABLE "Product" ADD COLUMN "newId" SERIAL', { transaction });
  await queryInterface.addColumn("CartItem", "newProductId", {
    type: DataTypes.INTEGER,
    allowNull: true,
  }, { transaction });
  await sequelize.query(
    `UPDATE "CartItem" AS cart
     SET "newProductId" = product."newId"
     FROM "Product" AS product
     WHERE cart."productId" = product."id"`,
    { transaction },
  );
  const [[orphanedCartItems]] = await sequelize.query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM "CartItem"
     WHERE "newProductId" IS NULL`,
    { transaction },
  );
  if (orphanedCartItems.count > 0) {
    throw new Error(`Cannot migrate product IDs: ${orphanedCartItems.count} cart items reference a missing product.`);
  }

  await queryInterface.changeColumn("CartItem", "newProductId", {
    type: DataTypes.INTEGER,
    allowNull: false,
  }, { transaction });
  await sequelize.query(
    `ALTER TABLE "CartItem" DROP COLUMN "productId";
     ALTER TABLE "CartItem" RENAME COLUMN "newProductId" TO "productId";
     ALTER TABLE "Product" DROP COLUMN "id";
     ALTER TABLE "Product" RENAME COLUMN "newId" TO "id";
     ALTER TABLE "Product" ADD CONSTRAINT "Product_pkey" PRIMARY KEY ("id")`,
    { transaction },
  );
  await sequelize.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_userId_productId" ON "CartItem" ("userId", "productId")',
    { transaction },
  );
  await queryInterface.addConstraint("CartItem", {
    fields: ["productId"],
    type: "foreign key",
    name: "CartItem_productId_fkey",
    references: { table: "Product", field: "id" },
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    transaction,
  });
}

async function syncDatabase() {
  const exhaustedProductImages = await sequelize.transaction(async transaction => {
    const models = [User, Category, Product, CartItem, Sale, SaleAudit];
    for (const model of models) {
      await createMissingModel(model, transaction);
    }

    const userColumns = await sequelize.getQueryInterface().describeTable("User", { transaction });
    if (!userColumns.ownerNote) {
      await sequelize.getQueryInterface().addColumn("User", "ownerNote", {
        type: DataTypes.TEXT,
        allowNull: true,
      }, { transaction });
    }
    const saleAuditColumns = await sequelize.getQueryInterface().describeTable("SaleAudit", { transaction });
    if (!saleAuditColumns.adminName) {
      await sequelize.getQueryInterface().addColumn("SaleAudit", "adminName", {
        type: DataTypes.TEXT,
        allowNull: true,
      }, { transaction });
    }
    if (/USER-DEFINED|ENUM/i.test(String(userColumns.role.type))) {
      await sequelize.query(
        `ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
         ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING "role"::text;
         ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
         DROP TYPE IF EXISTS "enum_User_role"`,
        { transaction },
      );
    }

    await migrateProductIds(transaction);

    const queryInterface = sequelize.getQueryInterface();
    const saleColumns = await queryInterface.describeTable("Sale", { transaction });
    if (!saleColumns.productSnapshot) {
      await queryInterface.addColumn("Sale", "productSnapshot", {
        type: DataTypes.JSONB,
        allowNull: true,
      }, { transaction });
    }
    if (!saleColumns.status) {
      await queryInterface.addColumn("Sale", "status", {
        type: DataTypes.ENUM("COMPLETED", "VOIDED"),
        allowNull: false,
        defaultValue: "COMPLETED",
      }, { transaction });
    }
    if (!saleColumns.voidedAt) {
      await queryInterface.addColumn("Sale", "voidedAt", {
        type: DataTypes.DATE,
        allowNull: true,
      }, { transaction });
    }
    if (!saleColumns.voidReason) {
      await queryInterface.addColumn("Sale", "voidReason", {
        type: DataTypes.TEXT,
        allowNull: true,
      }, { transaction });
    }

    const productColumns = await queryInterface.describeTable("Product", { transaction });
    if (!productColumns.categoryId) {
      await queryInterface.addColumn("Product", "categoryId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      }, { transaction });
    }
    if (!productColumns.discountPercent) {
      await queryInterface.addColumn("Product", "discountPercent", {
        type: DataTypes.DECIMAL,
        allowNull: true,
      }, { transaction });
    }

    if (productColumns.salePrice) {
      await sequelize.query(
        `UPDATE "Product"
         SET "discountPercent" = ROUND((1 - "salePrice" / "price") * 100, 4)
         WHERE "discountPercent" IS NULL
           AND "salePrice" IS NOT NULL
           AND "salePrice" > 0
           AND "salePrice" < "price"`,
        { transaction },
      );
    }

    const [foreignKeys] = await sequelize.query(
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema = current_schema()
         AND table_name = 'Product'
         AND constraint_type = 'FOREIGN KEY'
         AND constraint_name = 'Product_categoryId_fkey'`,
      { transaction },
    );
    if (!foreignKeys.length) {
      await queryInterface.addConstraint("Product", {
        fields: ["categoryId"],
        type: "foreign key",
        name: "Product_categoryId_fkey",
        references: { table: "Category", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        transaction,
      });
    }

    const [discountChecks] = await sequelize.query(
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema = current_schema()
         AND table_name = 'Product'
         AND constraint_type = 'CHECK'
         AND constraint_name = 'Product_discountPercent_check'`,
      { transaction },
    );
    if (!discountChecks.length) {
      await queryInterface.addConstraint("Product", {
        fields: ["discountPercent"],
        type: "check",
        name: "Product_discountPercent_check",
        where: {
          [Op.or]: [
            { discountPercent: null },
            literal('"discountPercent" > 0 AND "discountPercent" < 100'),
          ],
        },
        transaction,
      });
    }

    await sequelize.query(
      'CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product" ("categoryId")',
      { transaction },
    );

    const exhaustedProducts = await Product.findAll({
      where: { stock: { [Op.lte]: 0 } },
      attributes: ["id", "imageUrl"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (exhaustedProducts.length) {
      await Product.destroy({
        where: { id: exhaustedProducts.map(product => product.id) },
        transaction,
      });
    }
    return exhaustedProducts.map(product => product.imageUrl);
  });

  for (const imageUrl of exhaustedProductImages) {
    await removeImage(imageUrl);
  }
}

module.exports = syncDatabase;
