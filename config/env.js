const path = require("node:path");
const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const schema = z.object({
  DB_URL: z.string().url()
    .refine(value => value.startsWith("postgres://") || value.startsWith("postgresql://"))
    .optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_USENAME: z.string().min(1).optional(),
  DB_PASWORD: z.string().min(1).optional(),
  DB_NAME: z.string().min(1).optional(),
  DB_DIALECT: z.literal("postgres").default("postgres"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_TIMEZONE: z.string().min(1).default("+07:00"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.string().email().transform(email => email.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(8).max(72)
    .refine(password => Buffer.byteLength(password, "utf8") <= 72)
    .optional(),
  ADMIN_NAME: z.string().trim().min(2).max(100).default("Quản trị viên"),
  API_PORT: z.coerce.number().int().positive().default(Number(process.env.PORT) || 4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
}).superRefine((config, context) => {
  const hasIndividualDatabaseConfig = [
    config.DB_HOST,
    config.DB_USENAME,
    config.DB_PASWORD,
    config.DB_NAME,
  ].every(Boolean);
  if (!config.DB_URL && !hasIndividualDatabaseConfig) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DB_URL"],
      message: "Cần DB_URL hoặc cấu hình đầy đủ DB_HOST, DB_USENAME, DB_PASWORD và DB_NAME.",
    });
  }
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error("Cấu hình BE/.env không hợp lệ:", result.error.issues.map(issue => ({
    variable: issue.path.join("."),
    message: issue.message,
  })));
  process.exit(1);
}

module.exports = { env: result.data };
