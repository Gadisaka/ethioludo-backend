const axios = require("axios");
require("dotenv").config();

const API_URL = "http://localhost:4002";

// Test data - in a real scenario, this would come from Telegram Web App
const testInitData =
  "user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Test%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22testuser%22%2C%22language_code%22%3A%22en%22%7D&chat_instance=-123456789&chat_type=sender&auth_date=1234567890&hash=test_hash";

const testTelegramAuth = async () => {
  try {
    console.log("Testing Telegram authentication...");

    // Test 1: Authentication with initData
    console.log("\n1. Testing authentication with initData...");
    const authResponse = await axios.post(
      `${API_URL}/auth/telegram/telegram-auth`,
      {
        initData: testInitData,
        phoneNumber: "+1234567890",
      }
    );

    console.log("✅ Authentication successful!");
    console.log("User:", authResponse.data.user);
    console.log("Token:", authResponse.data.token ? "Present" : "Missing");

    const token = authResponse.data.token;

    // Test 2: Update phone number
    console.log("\n2. Testing phone number update...");
    const phoneUpdateResponse = await axios.post(
      `${API_URL}/auth/telegram/update-phone`,
      {
        telegram_id: 123456789,
        phoneNumber: "+9876543210",
      }
    );

    console.log("✅ Phone number update successful!");
    console.log("Updated user:", phoneUpdateResponse.data.user);

    // Test 3: Test protected route with token
    console.log("\n3. Testing protected route access...");
    const protectedResponse = await axios.get(`${API_URL}/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("✅ Protected route access successful!");
    console.log("Response status:", protectedResponse.status);
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);

    if (error.response?.status === 401) {
      console.log(
        "\n💡 Note: This is expected if the bot token is not configured or initData is invalid."
      );
      console.log("   Make sure to:");
      console.log("   1. Set TELEGRAM_BOT_TOKEN in your .env file");
      console.log("   2. Use real initData from Telegram Web App");
    }
  }
};

// Run the test
testTelegramAuth();
