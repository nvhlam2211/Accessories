const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const SaleAudit = sequelize.define("SaleAudit", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  adminId: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  adminName: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  action: {
    type: DataTypes.ENUM("EDIT", "VOID"),
    allowNull: false,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  before: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  after: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
}, {
  tableName: "SaleAudit",
  indexes: [{ fields: ["saleId", "createdAt"] }],
});

module.exports = SaleAudit;
