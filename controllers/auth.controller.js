const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { z } = require("zod");
const { env } = require("../config/env");
const { User } = require("../models");
const { authCookie, sessionCookieOptions } = require("../middlewares/auth.middleware");
const httpError = require("../utils/httpError");

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
const dummyPasswordHash = bcrypt.hashSync("not-a-real-account-password", 10);

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform(email => email.toLowerCase()),
  password: z.string().min(8).max(72).refine(
    password => Buffer.byteLength(password, "utf8") <= 72,
    "Mật khẩu không được vượt quá 72 byte.",
  ),
});

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasPassword: Boolean(user.passwordHash),
  };
}

function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie(authCookie, token, {
    ...sessionCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

async function register(req, res) {
  const { email, password, name } = credentialsSchema.extend({
    name: z.string().trim().min(2).max(100),
  }).parse(req.body);
  if (email === env.ADMIN_EMAIL) {
    throw httpError(403, "Email quản trị viên không thể đăng ký công khai.");
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw httpError(409, existingUser.passwordHash
      ? "Email này đã được đăng ký. Hãy đăng nhập."
      : "Email này đã liên kết với Google. Hãy đăng nhập bằng Google.");
  }

  const user = await User.create({
    email,
    name,
    passwordHash: await bcrypt.hash(password, 12),
    role: "CUSTOMER",
  });
  setSessionCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
}

async function login(req, res) {
  const { email, password } = credentialsSchema.parse(req.body);
  const user = await User.findOne({ where: { email } });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash);
  if (!user?.passwordHash || !passwordMatches) {
    throw httpError(401, "Email hoặc mật khẩu không chính xác.");
  }
  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
}

async function googleLogin(req, res) {
  const { credential } = z.object({ credential: z.string().min(1) }).parse(req.body);
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
  } catch {
    throw httpError(401, "Không thể xác minh tài khoản Google.");
  }
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw httpError(401, "Không thể xác minh tài khoản Google.");
  }

  const email = payload.email.toLowerCase();
  const existingUser = await User.findOne({ where: { email } });
  const role = email === env.ADMIN_EMAIL
    ? "SUPER_ADMIN"
    : existingUser?.role === "ADMIN" || existingUser?.role === "SUPER_ADMIN"
      ? existingUser.role
      : "CUSTOMER";
  const [user] = await User.findOrCreate({
    where: { email },
    defaults: { googleId: payload.sub, email, name: payload.name ?? email, role },
  });
  if (user.googleId !== payload.sub || user.role !== role || user.name !== (payload.name ?? email)) {
    await user.update({ googleId: payload.sub, role, name: payload.name ?? email });
  }
  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
}

async function me(req, res) {
  const user = await User.findByPk(req.auth.sub, {
    attributes: ["id", "name", "email", "role", "passwordHash"],
  });
  if (!user) {
    res.clearCookie(authCookie, sessionCookieOptions);
    throw httpError(401, "Không tìm thấy tài khoản.");
  }
  res.json({ user: publicUser(user) });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = z.object({
    currentPassword: credentialsSchema.shape.password.optional(),
    newPassword: credentialsSchema.shape.password,
  }).parse(req.body);
  const user = await User.findByPk(req.auth.sub, {
    attributes: ["id", "name", "email", "role", "passwordHash"],
  });
  if (!user) throw httpError(401, "Không tìm thấy tài khoản.");
  if (user.passwordHash) {
    if (!currentPassword || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      throw httpError(400, "Mật khẩu hiện tại không chính xác.");
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw httpError(400, "Mật khẩu mới phải khác mật khẩu hiện tại.");
    }
  }
  await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) });
  res.json({ user: publicUser(user) });
}

function logout(_req, res) {
  res.clearCookie(authCookie, sessionCookieOptions);
  res.status(204).end();
}

module.exports = { register, login, googleLogin, me, changePassword, logout };
