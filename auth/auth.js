const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();
// const prisma = require("../prisma/prismaClient.js");

const User = require("../model/User");

// Nodemailer configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper function to generate 6-digit random code
const generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const router = express.Router();

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
        //1year
        expiresIn: "365d",
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

// Forgot Password - Send reset code to email
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if user exists with this email
    const user = await User.findOne({ email });

    // Always return success message for security (don't reveal if email exists)
    const successMessage =
      "If an account with that email exists, a reset code has been sent.";

    if (!user) {
      return res.status(200).json({ message: successMessage });
    }

    // Generate 6-digit reset code
    const resetCode = generateResetCode();
    const resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Update user with reset code
    await User.findByIdAndUpdate(user._id, {
      resetCode,
      resetCodeExpires,
    });

    // Send email with reset code
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "🔐 Password Reset Code - Ethio Games",
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset - Ethio Games</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <div style="background-color: rgba(255, 255, 255, 0.2); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M19 12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12C5 8.13401 8.13401 5 12 5C15.866 5 19 8.13401 19 12Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M12 1V3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M12 21V23" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M4.22 4.22L5.64 5.64" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M18.36 18.36L19.78 19.78" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M1 12H3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M21 12H23" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M4.22 19.78L5.64 18.36" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M18.36 5.64L19.78 4.22" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);">
                Password Reset
              </h1>
              <p style="color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 10px 0 0; font-weight: 300;">
                Ethio Games Admin Panel
              </p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h2 style="color: #2d3748; font-size: 24px; font-weight: 600; margin: 0 0 15px; line-height: 1.3;">
                  Hello ${user.username}! 👋
                </h2>
                <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0;">
                  We received a request to reset your password. Use the verification code below to create a new password.
                </p>
              </div>

              <!-- Verification Code Box -->
              <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border: 2px dashed #cbd5e0; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; position: relative;">
                <div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background-color: #ffffff; padding: 0 15px;">
                  <span style="color: #718096; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                    Verification Code
                  </span>
                </div>
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-size: 36px; font-weight: 800; letter-spacing: 8px; margin: 10px 0; font-family: 'Courier New', monospace;">
                  ${resetCode}
                </div>
                <p style="color: #718096; font-size: 14px; margin: 0; font-weight: 500;">
                  Enter this code in the verification form
                </p>
              </div>

              <!-- Important Notice -->
              <div style="background-color: #fff5f5; border-left: 4px solid #f56565; padding: 20px; border-radius: 0 8px 8px 0; margin: 25px 0;">
                <div style="display: flex; align-items: flex-start;">
                  <div style="margin-right: 12px; margin-top: 2px;">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="#f56565">
                      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <div>
                    <h4 style="color: #c53030; font-size: 14px; font-weight: 600; margin: 0 0 5px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Important Security Notice
                    </h4>
                    <p style="color: #742a2a; font-size: 14px; margin: 0; line-height: 1.5;">
                      This code will expire in <strong>10 minutes</strong> for your security. If you didn't request this password reset, please ignore this email and your account will remain secure.
                    </p>
                  </div>
                </div>
              </div>

              <!-- Steps -->
              <div style="margin: 30px 0;">
                <h3 style="color: #2d3748; font-size: 18px; font-weight: 600; margin: 0 0 20px; text-align: center;">
                  Next Steps
                </h3>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                  <div style="display: flex; align-items: center; padding: 15px; background-color: #f7fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                    <div style="background-color: #667eea; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; margin-right: 15px; flex-shrink: 0;">
                      1
                    </div>
                    <p style="color: #4a5568; margin: 0; font-size: 14px; line-height: 1.5;">
                      Copy the verification code above
                    </p>
                  </div>
                  <div style="display: flex; align-items: center; padding: 15px; background-color: #f7fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                    <div style="background-color: #667eea; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; margin-right: 15px; flex-shrink: 0;">
                      2
                    </div>
                    <p style="color: #4a5568; margin: 0; font-size: 14px; line-height: 1.5;">
                      Return to the verification page and enter the code
                    </p>
                  </div>
                  <div style="display: flex; align-items: center; padding: 15px; background-color: #f7fafc; border-radius: 8px; border-left: 4px solid #667eea;">
                    <div style="background-color: #667eea; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; margin-right: 15px; flex-shrink: 0;">
                      3
                    </div>
                    <p style="color: #4a5568; margin: 0; font-size: 14px; line-height: 1.5;">
                      Create your new secure password
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <div style="margin-bottom: 20px;">
                <div style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">
                  🎮 Ethio Games
                </div>
              </div>
              <p style="color: #718096; font-size: 12px; margin: 0 0 10px; line-height: 1.5;">
                This is an automated message. Please do not reply to this email.
              </p>
              
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: successMessage });
  } catch (error) {
    console.error("Forgot password error:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
});

// Verify Reset Code
router.post("/verify-reset-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    // Find user with email and valid reset code
    const user = await User.findOne({
      email,
      resetCode: code,
      resetCodeExpires: { $gt: new Date() }, // Code not expired
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    res.status(200).json({
      message: "Reset code verified successfully",
      success: true,
    });
  } catch (error) {
    console.error("Verify reset code error:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
});

// Reset Password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res
        .status(400)
        .json({ message: "Email, code, and new password are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    // Find user with email and valid reset code
    const user = await User.findOne({
      email,
      resetCode: code,
      resetCodeExpires: { $gt: new Date() }, // Code not expired
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password and clear reset code
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      resetCode: undefined,
      resetCodeExpires: undefined,
      updatedAt: new Date(),
    });

    res.status(200).json({
      message:
        "Password reset successfully. You can now login with your new password.",
      success: true,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
});

module.exports = router;
