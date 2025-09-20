const axios = require("axios");

// Test script to verify Telegram integration
async function testTelegramIntegration() {
  const baseUrl = process.env.SERVER_URL || "http://localhost:4002";

  console.log("🧪 Testing Telegram Integration...\n");

  try {
    // Test 1: Check Telegram stats endpoint
    console.log("1️⃣ Testing /api/stats endpoint...");
    const statsResponse = await axios.get(`${baseUrl}/api/stats`);
    console.log("✅ Stats endpoint working:", {
      success: statsResponse.data.success,
      totalUsers: statsResponse.data.totalUsers,
      totalMessagesSent: statsResponse.data.totalMessagesSent,
    });

    // Test 2: Test user registration (simulate a Telegram user)
    console.log("\n2️⃣ Testing user registration...");
    const testUser = {
      telegramId: 123456789,
      username: "testuser",
      firstName: "Test",
      lastName: "User",
      languageCode: "en",
    };

    const registerResponse = await axios.post(
      `${baseUrl}/api/save-user`,
      testUser
    );
    console.log("✅ User registration working:", {
      success: registerResponse.data.success,
      isNewUser: registerResponse.data.isNewUser,
      userCount: registerResponse.data.userCount,
    });

    // Test 3: Test broadcast functionality
    console.log("\n3️⃣ Testing broadcast functionality...");
    const broadcastResponse = await axios.post(`${baseUrl}/api/broadcast`, {
      message: "Test message from integration test",
      type: "INFO",
    });
    console.log("✅ Broadcast functionality working:", {
      success: broadcastResponse.data.success,
      sentCount: broadcastResponse.data.sentCount,
      totalUsers: broadcastResponse.data.totalUsers,
    });

    // Test 4: Test admin notification with Telegram integration
    console.log("\n4️⃣ Testing admin notification with Telegram integration...");
    const adminResponse = await axios.post(
      `${baseUrl}/admin/send-notification`,
      {
        message: "Test admin notification with Telegram integration",
        type: "INFO",
      }
    );
    console.log("✅ Admin notification with Telegram working:", {
      success: adminResponse.data.success,
      userCount: adminResponse.data.userCount,
      telegramResult: adminResponse.data.telegramResult,
    });

    console.log(
      "\n🎉 All tests passed! Telegram integration is working correctly with internal calls!"
    );
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);

    if (error.code === "ECONNREFUSED") {
      console.log("\n💡 Make sure the server is running on the correct port.");
    }
  }
}

// Run the test
testTelegramIntegration();
