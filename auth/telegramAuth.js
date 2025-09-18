const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../model/User");

const router = express.Router();

// Function to verify Telegram WebApp initData
const verifyTelegramWebAppData = (initData, botToken) => {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    urlParams.delete("hash");

    // Sort parameters alphabetically
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Create secret key from bot token
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    return calculatedHash === hash;
  } catch (error) {
    console.error("Error verifying Telegram data:", error);
    return false;
  }
};

// Function to parse initData and extract user information
const parseInitData = (initData) => {
  try {
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get("user");

    if (!userParam) {
      throw new Error("No user data found in initData");
    }

    const userData = JSON.parse(userParam);
    return {
      id: userData.id,
      first_name: userData.first_name,
      last_name: userData.last_name,
      username: userData.username,
      language_code: userData.language_code,
      is_premium: userData.is_premium,
    };
  } catch (error) {
    console.error("Error parsing initData:", error);
    throw new Error("Invalid initData format");
  }
};

// Telegram authentication route
router.post("/telegram-auth", async (req, res) => {
  try {
    const { initData, phoneNumber } = req.body;

    if (!initData) {
      return res.status(400).json({
        message: "initData is required",
        error: "MISSING_INIT_DATA",
      });
    }

    // Verify the initData using bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN not found in environment variables");
      return res.status(500).json({
        message: "Server configuration error",
        error: "BOT_TOKEN_MISSING",
      });
    }

    const isValid = verifyTelegramWebAppData(initData, botToken);
    if (!isValid) {
      return res.status(401).json({
        message: "Invalid Telegram data",
        error: "INVALID_TELEGRAM_DATA",
      });
    }

    // Parse user data from initData
    const telegramUser = parseInitData(initData);

    // Check if user exists by telegram_id
    let user = await User.findOne({ telegram_id: telegramUser.id });

    if (user) {
      // User exists, update phone number if provided and not already set
      if (phoneNumber && !user.phone_number) {
        user.phone_number = phoneNumber;
        await user.save();
      }
    } else {
      // Create new user
      const username =
        telegramUser.username ||
        `${telegramUser.first_name}${
          telegramUser.last_name ? "_" + telegramUser.last_name : ""
        }` ||
        `user_${telegramUser.id}`;

      user = await User.create({
        telegram_id: telegramUser.id,
        username: username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
        phone_number: phoneNumber || null,
        role: "PLAYER",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        telegram_id: user.telegram_id,
        role: user.role,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "72h",
      }
    );

    // Set token in response
    res.set("Authorization", `Bearer ${token}`);
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({
      message: "Authentication successful",
      user: {
        _id: user._id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone_number: user.phone_number,
        role: user.role,
        isActive: user.isActive,
        wallet: user.wallet,
      },
      token: token,
      isNewUser: !user.phone_number && !phoneNumber, // Indicates if phone number is still needed
    });
  } catch (error) {
    console.error("Telegram authentication error:", error);
    res.status(500).json({
      message: "Authentication failed",
      error: error.message,
    });
  }
});

// Route to update phone number for existing Telegram users
router.post("/update-phone", async (req, res) => {
  try {
    const { telegram_id, phoneNumber } = req.body;

    if (!telegram_id || !phoneNumber) {
      return res.status(400).json({
        message: "telegram_id and phoneNumber are required",
      });
    }

    const user = await User.findOne({ telegram_id });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.phone_number = phoneNumber;
    await user.save();

    res.status(200).json({
      message: "Phone number updated successfully",
      user: {
        _id: user._id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone_number: user.phone_number,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Phone update error:", error);
    res.status(500).json({
      message: "Failed to update phone number",
      error: error.message,
    });
  }
});

module.exports = router;
