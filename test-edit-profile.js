const axios = require("axios");
require("dotenv").config();

const API_BASE_URL = process.env.API_URL || "http://localhost:5000";

// Test admin login and profile endpoints
async function testEditProfile() {
  try {
    console.log("🧪 Testing Edit Profile API endpoints...\n");

    // Step 1: Login as admin
    console.log("1️⃣ Logging in as admin...");
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      phone: "0912121212",
      password: "0912121212",
      role: "ADMIN",
    });

    const token = loginResponse.data.token;
    console.log("✅ Login successful");
    console.log("📝 Token received:", token.substring(0, 20) + "...\n");

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // Step 2: Get current admin profile
    console.log("2️⃣ Fetching current admin profile...");
    const profileResponse = await axios.get(`${API_BASE_URL}/admin/profile`, {
      headers,
    });

    console.log("✅ Profile fetched successfully");
    console.log("📝 Current profile:", {
      username: profileResponse.data.admin.username,
      phone: profileResponse.data.admin.phone,
      email: profileResponse.data.admin.email || "No email",
      role: profileResponse.data.admin.role,
    });

    // Step 3: Update admin profile (phone and email)
    console.log("\n3️⃣ Updating admin profile...");
    const updateData = {
      phone: "0912121213",
      email: "admin@ludoking.ethio.com",
    };

    const updateResponse = await axios.patch(
      `${API_BASE_URL}/admin/profile`,
      updateData,
      {
        headers,
      }
    );

    console.log("✅ Profile updated successfully");
    console.log("📝 Updated profile:", {
      username: updateResponse.data.admin.username,
      phone: updateResponse.data.admin.phone,
      email: updateResponse.data.admin.email,
      role: updateResponse.data.admin.role,
    });

    // Step 4: Test password change
    console.log("\n4️⃣ Testing password change...");
    const passwordUpdateData = {
      phone: "0912121213",
      email: "admin@ludoking.ethio.com",
      currentPassword: "0912121212",
      newPassword: "newpassword123",
    };

    const passwordUpdateResponse = await axios.patch(
      `${API_BASE_URL}/admin/profile`,
      passwordUpdateData,
      {
        headers,
      }
    );

    console.log("✅ Password updated successfully");
    console.log("📝 Final profile:", {
      username: passwordUpdateResponse.data.admin.username,
      phone: passwordUpdateResponse.data.admin.phone,
      email: passwordUpdateResponse.data.admin.email,
      role: passwordUpdateResponse.data.admin.role,
    });

    // Step 5: Test login with new password
    console.log("\n5️⃣ Testing login with new password...");
    const newLoginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      phone: "0912121213",
      password: "newpassword123",
      role: "ADMIN",
    });

    console.log("✅ Login with new password successful");
    console.log(
      "📝 New token received:",
      newLoginResponse.data.token.substring(0, 20) + "..."
    );

    console.log(
      "\n🎉 All tests passed! Edit profile functionality is working correctly."
    );
  } catch (error) {
    console.error("❌ Test failed:", error.response?.data || error.message);

    if (error.response?.status === 401) {
      console.log(
        "\n💡 Make sure the admin user exists and the backend server is running."
      );
      console.log(
        "💡 You can create admin users by running: node seed/admin.js"
      );
    }
  }
}

// Run the test
testEditProfile();
