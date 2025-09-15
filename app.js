const express = require("express");
const cors = require("cors");
const authRoutes = require("./auth/auth.js");
const UserRoutes = require("./routes/user.routes.js");
const GameRoutes = require("./routes/game.routes.js");
const WalletRoutes = require("./routes/wallet.routes.js");
const AdminRoutes = require("./routes/admin.routes.js");
const GameSettingRoutes = require("./routes/gameSetting.routes.js");
const AdsRoutes = require("./routes/ads.routes.js");
const PublicAdsRoutes = require("./routes/publicAds.routes.js");

const app = express();

// Middleware to add socket.io to request object
app.use((req, res, next) => {
  req.io = req.app.get("io");
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
app.use("/auth", authRoutes);
app.use("/games", GameRoutes);
app.use("/users", UserRoutes);
app.use("/wallet", WalletRoutes);
app.use("/admin", AdminRoutes);
app.use("/admin/settings", GameSettingRoutes);
app.use("/admin/ads", AdsRoutes);
app.use("/ads", PublicAdsRoutes);
app.use("/upload", require("./config/uploadRoute"));

// Add basic route for testing
app.get("/", (req, res) => {
  res.send("Server is running");
});

app.use((req, res, next) => {
  res.status(404).send("Page not found!");
  console.log("error a");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
  console.log("error b");
});

module.exports = app;
