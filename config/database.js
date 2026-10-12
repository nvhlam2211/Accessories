const { Sequelize } = require("sequelize");
const { env } = require("./env");

const options = {
  dialect: env.DB_DIALECT,
  timezone: env.DB_TIMEZONE,
  logging: false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30_000,
    idle: 10_000,
  },
  define: {
    freezeTableName: true,
    timestamps: true,
  },
};

const sequelize = env.DB_URL
  ? new Sequelize(env.DB_URL, {
    ...options,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
  })
  : new Sequelize(env.DB_NAME, env.DB_USENAME, env.DB_PASWORD, {
    ...options,
    host: env.DB_HOST,
    port: env.DB_PORT,
  });

module.exports = sequelize;
