const bcrypt = require("bcrypt");
const { env } = require("./env");
const { User } = require("../models");

async function initAdmin() {
  const [admin, created] = await User.findOrCreate({
    where: { email: env.ADMIN_EMAIL },
    defaults: {
      name: env.ADMIN_NAME,
      role: "SUPER_ADMIN",
    },
  });

  const changes = {};
  if (admin.role !== "SUPER_ADMIN") changes.role = "SUPER_ADMIN";
  if (env.ADMIN_PASSWORD) {
    const passwordMatches = admin.passwordHash
      ? await bcrypt.compare(env.ADMIN_PASSWORD, admin.passwordHash)
      : false;
    if (!passwordMatches) changes.passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  }
  if (Object.keys(changes).length) await admin.update(changes);

  if (created && !env.ADMIN_PASSWORD) {
    console.warn("Tài khoản admin đã được tạo. Đăng nhập bằng Google hoặc cấu hình ADMIN_PASSWORD để dùng mật khẩu.");
  }
  if (!env.ADMIN_PASSWORD) {
    console.warn("ADMIN_PASSWORD chưa được cấu hình. Hãy thêm mật khẩu vào BE/.env rồi khởi động lại backend.");
  }
}

module.exports = initAdmin;
