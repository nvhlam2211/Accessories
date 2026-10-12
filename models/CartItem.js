const { DataTypes } = require("sequelize");
const { randomUUID } = require("node:crypto");
const sequelize = require("../config/database");

const CartItem = sequelize.define("CartItem", {
  id: {
    type: DataTypes.TEXT,
    primaryKey: true,
    defaultValue: () => randomUUID(),
  },
  userId: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: { min: 1, max: 100 },
  },
}, {
  tableName: "CartItem",
  indexes: [{ unique: true, fields: ["userId", "productId"] }],
});

module.exports = CartItem;
