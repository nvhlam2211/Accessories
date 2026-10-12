const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Category = sequelize.define("Category", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { len: [2, 100] },
  },
  slug: {
    type: DataTypes.STRING(120),
    allowNull: false,
    validate: { is: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: "Category",
  indexes: [{ unique: true, fields: ["slug"] }],
});

module.exports = Category;
