const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// const prisma = require("../prisma/prismaClient.js");

const User = require("../model/User");
const telegramAuth = require("./telegramAuth");

const router = express.Router();

// Include Telegram authentication routes
router.use("/telegram", telegramAuth);

router.post("/register", async (req, res) => {
  const { phone, password } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser)
      return res.status(400).json({ message: "Phone number already exists." });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = await User.create({
      ...req.body,
      password: hashedPassword,
    });

    res.status(201).json({
      message: "User registered successfully.",
      user: newUser,
    });
  } catch (error) {
    res.status(500).json({ message: "Something went wrong.", error });
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { phone, password, role } = req.body; // Role is sent from the frontend

  try {
    // Find user by phone
    const user = await User.findOne({ phone });
    if (!user)
      return res.status(400).json({ message: "Invalid phone or password." });

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(400).json({ message: "Invalid phone or password." });

    // Check if user role matches the requested role
    if (user.role !== role) {
      return res
        .status(403)
        .json({ message: "You don't have permission to access this panel." });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "72h",
      }
    );
    res.set("Authorization", `Bearer ${token}`);
    res.cookie("token", token, {
      httpOnly: true,
      // secure: process.env.production,
      sameSite: "strict",
    });
    res.status(200).json({
      message: `Logged in successfully as ${role}`,
      user: user,
      token: token,
    });
  } catch (error) {
    res.status(500).json({ message: "Something went wrong.", error });
  }
});

router.post("/signout", (req, res, next) => {
  try {
    res.clearCookie("token");
    res.status(200).json({ message: "user logged out", status: "success" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
