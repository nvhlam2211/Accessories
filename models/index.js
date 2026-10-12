const sequelize = require("../config/database");
const User = require("./User");
const Product = require("./Product");
const Category = require("./Category");
const CartItem = require("./CartItem");
const Sale = require("./Sale");
const SaleAudit = require("./SaleAudit");

User.hasMany(CartItem, { as: "cartItems", foreignKey: "userId", onDelete: "CASCADE" });
CartItem.belongsTo(User, { as: "user", foreignKey: "userId" });
Product.hasMany(CartItem, { as: "cartItems", foreignKey: "productId", onDelete: "CASCADE" });
CartItem.belongsTo(Product, { as: "product", foreignKey: "productId" });
Category.hasMany(Product, { as: "products", foreignKey: "categoryId", onDelete: "SET NULL" });
Product.belongsTo(Category, { as: "category", foreignKey: "categoryId" });
Product.hasMany(Sale, { as: "sales", foreignKey: "productId", onDelete: "SET NULL" });
Sale.belongsTo(Product, { as: "product", foreignKey: "productId" });
Sale.hasMany(SaleAudit, { as: "audits", foreignKey: "saleId", onDelete: "CASCADE" });
SaleAudit.belongsTo(Sale, { as: "sale", foreignKey: "saleId" });

module.exports = { sequelize, User, Product, Category, CartItem, Sale, SaleAudit };
