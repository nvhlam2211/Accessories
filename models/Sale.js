const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Sale = sequelize.define("Sale", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  productName: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  productSnapshot: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  unitPrice: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    validate: { min: 0.01 },
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 100000 },
  },
  soldAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  status: {
    type: DataTypes.ENUM("COMPLETED", "VOIDED"),
    allowNull: false,
    defaultValue: "COMPLETED",
  },
  voidedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  voidReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "Sale",
  indexes: [{ fields: ["soldAt"] }],
});

module.exports = Sale;
