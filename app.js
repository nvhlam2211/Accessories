const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const { env } = require("./config/env");
const apiRoutes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/errorHandler");

const app = express();

app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(__dirname, "uploads"), {
  maxAge: "1d",
  dotfiles: "deny",
}));
app.use("/api", apiRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
