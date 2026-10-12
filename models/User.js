const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { randomUUID } = require("node:crypto");

const User = sequelize.define("User", {
  id: {
    type: DataTypes.TEXT,
    primaryKey: true,
    defaultValue: () => randomUUID(),
  },
  googleId: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  email: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { isEmail: true },
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: { len: [2, 100] },
  },
  ownerNote: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: { len: [2, 200] },
  },
  passwordHash: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  role: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "CUSTOMER",
    validate: { isIn: [["CUSTOMER", "ADMIN", "SUPER_ADMIN"]] },
  },
}, {
  tableName: "User",
  indexes: [{ unique: true, fields: ["email"] }, { unique: true, fields: ["googleId"] }],
});

module.exports = User;
