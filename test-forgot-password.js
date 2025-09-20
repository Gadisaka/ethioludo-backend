const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = process.env.API_URL || "http://localhost:5000";

// Test forgot password flow
async function testForgotPasswordFlow() {
  try {
    console.log("🧪 Testing Forgot Password Flow...\n");

    // Step 1: Test forgot password with valid email
    console.log("1️⃣ Testing forgot password with valid email...");
    const forgotPasswordResponse = await axios.post(
      `${API_BASE_URL}/auth/forgot-password`,
      {
        email: "admin@ludoking.ethio.com",
      }
    );

    console.log(
      "✅ Forgot password response:",
      forgotPasswordResponse.data.message
    );

    // Step 2: Test forgot password with invalid email (should still return success for security)
    console.log("\n2️⃣ Testing forgot password with invalid email...");
    const invalidEmailResponse = await axios.post(
      `${API_BASE_URL}/auth/forgot-password`,
      {
        email: "nonexistent@example.com",
      }
    );

    console.log(
      "✅ Invalid email response:",
      invalidEmailResponse.data.message
    );

    // Step 3: Test verify reset code with invalid code
    console.log("\n3️⃣ Testing verify reset code with invalid code...");
    try {
      await axios.post(`${API_BASE_URL}/auth/verify-reset-code`, {
        email: "admin@ludoking.ethio.com",
        code: "000000",
      });
    } catch (error) {
      console.log(
        "✅ Invalid code error (expected):",
        error.response.data.message
      );
    }

    // Step 4: Test reset password with invalid code
    console.log("\n4️⃣ Testing reset password with invalid code...");
    try {
      await axios.post(`${API_BASE_URL}/auth/reset-password`, {
        email: "admin@ludoking.ethio.com",
        code: "000000",
        newPassword: "newpassword123",
      });
    } catch (error) {
      console.log(
        "✅ Invalid code error (expected):",
        error.response.data.message
      );
    }

    // Step 5: Test reset password with short password
    console.log("\n5️⃣ Testing reset password with short password...");
    try {
      await axios.post(`${API_BASE_URL}/auth/reset-password`, {
        email: "admin@ludoking.ethio.com",
        code: "123456",
        newPassword: "123",
      });
    } catch (error) {
      console.log(
        "✅ Short password error (expected):",
        error.response.data.message
      );
    }

    console.log("\n🎉 Forgot password flow tests completed!");
    console.log("\n📝 Note: To test the complete flow with a real reset code:");
    console.log("1. Check the email inbox for the reset code");
    console.log("2. Use the code to verify and reset password");
    console.log("3. Test login with the new password");
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);

    if (error.response?.status === 500) {
      console.log(
        "\n💡 Make sure the backend server is running and email configuration is set up."
      );
      console.log(
        "💡 Check your .env file has EMAIL_USER and EMAIL_PASS configured."
      );
    }
  }
}

// Run the test
testForgotPasswordFlow();
