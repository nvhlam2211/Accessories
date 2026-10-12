const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Product = sequelize.define("Product", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { len: [2, 120] },
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL,
    allowNull: false,
    validate: { min: 0.01 },
  },
  discountPercent: {
    type: DataTypes.DECIMAL,
    allowNull: true,
    validate: {
      isValidDiscount(value) {
        if (value !== null && value !== undefined && (Number(value) <= 0 || Number(value) >= 100)) {
          throw new Error("Phần trăm giảm giá phải lớn hơn 0% và nhỏ hơn 100%.");
        }
      },
    },
  },
  stock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0, max: 100000 },
  },
  imageUrl: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: "Product",
  indexes: [{ fields: ["active", "createdAt"] }, { fields: ["categoryId"] }],
});

module.exports = Product;
