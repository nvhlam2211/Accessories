const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { User } = require("../models");

const authCookie = "hairclip_session";
const sessionCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};

async function authenticate(req, res, next) {
  const token = req.cookies?.[authCookie];
  if (!token) {
    res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
    return;
  }

  try {
    req.auth = jwt.verify(token, env.JWT_SECRET);
  } catch {
    res.clearCookie(authCookie, sessionCookieOptions);
    res.status(401).json({ error: "Phiên đăng nhập đã hết hạn." });
    return;
  }

  try {
    const user = await User.findByPk(req.auth.sub, { attributes: ["id", "role"] });
    if (!user) {
      res.clearCookie(authCookie, sessionCookieOptions);
      res.status(401).json({ error: "Không tìm thấy tài khoản." });
      return;
    }
    req.auth.role = user.role;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  if (req.auth?.role !== "ADMIN" && req.auth?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Bạn không có quyền thực hiện thao tác này." });
    return;
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.auth?.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Chỉ Super Admin mới có quyền thực hiện thao tác này." });
    return;
  }
  next();
}

module.exports = { authCookie, sessionCookieOptions, authenticate, requireAdmin, requireSuperAdmin };
