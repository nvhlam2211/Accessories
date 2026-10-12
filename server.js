const app = require("./app");
const { env } = require("./config/env");
const { sequelize } = require("./models");
const syncDatabase = require("./config/syncDatabase");
const initAdmin = require("./config/initAdmin");

async function start() {
  await sequelize.authenticate();
  await syncDatabase();
  await initAdmin();

  if (process.argv.includes("--sync-only")) {
    console.log("Database PostgreSQL đã được đồng bộ với các model Sequelize.");
    await sequelize.close();
    return;
  }

  const PORT = process.env.PORT || 4000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });

  async function shutdown(signal) {
    console.log(`${signal}: đang đóng API...`);
    server.close(async (error) => {
      try {
        await sequelize.close();
        if (error) {
          console.error("Không thể đóng HTTP server sạch sẽ:", error);
          process.exitCode = 1;
        }
      } catch (closeError) {
        console.error("Không thể đóng kết nối PostgreSQL:", closeError);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch(async (error) => {
  console.error("Không thể khởi động API:", error);
  try {
    await sequelize.close();
  } catch (closeError) {
    console.error("Không thể đóng kết nối PostgreSQL:", closeError);
  }
  process.exitCode = 1;
});
