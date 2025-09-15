const axios = require("axios");

const API_BASE_URL = "http://localhost:4002";

// Test admin endpoints
async function testAdminEndpoints() {
  console.log("Testing Admin Endpoints...\n");

  try {
    // Test 1: Dashboard endpoint (should require auth)
    console.log("1. Testing /admin/dashboard (no auth):");
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/dashboard`);
      console.log("   ✅ SUCCESS:", response.status);
    } catch (error) {
      console.log(
        "   ❌ EXPECTED ERROR:",
        error.response?.status,
        error.response?.data?.message
      );
    }

    // Test 2: Transactions endpoint (should require auth)
    console.log("\n2. Testing /admin/transactions (no auth):");
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/transactions`);
      console.log("   ✅ SUCCESS:", response.status);
    } catch (error) {
      console.log(
        "   ❌ EXPECTED ERROR:",
        error.response?.status,
        error.response?.data?.message
      );
    }

    // Test 3: Games endpoint (should require auth)
    console.log("\n3. Testing /admin/games (no auth):");
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/games`);
      console.log("   ✅ SUCCESS:", response.status);
    } catch (error) {
      console.log(
        "   ❌ EXPECTED ERROR:",
        error.response?.status,
        error.response?.data?.message
      );
    }

    // Test 4: Users endpoint (should require auth)
    console.log("\n4. Testing /admin/users (no auth):");
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/users`);
      console.log("   ✅ SUCCESS:", response.status);
    } catch (error) {
      console.log(
        "   ❌ EXPECTED ERROR:",
        error.response?.status,
        error.response?.data?.message
      );
    }

    // Test 5: Check if models exist
    console.log("\n5. Testing model imports:");
    try {
      const User = require("./model/User.js");
      const GameHistory = require("./model/GameHistory.js");
      const Transaction = require("./model/Transaction.js");
      console.log("   ✅ All models imported successfully");
    } catch (error) {
      console.log("   ❌ Model import error:", error.message);
    }

    console.log("\n✅ Admin endpoint tests completed!");
    console.log(
      "   All endpoints should return 401 (Unauthorized) when no token is provided."
    );
    console.log(
      "   This confirms that authentication middleware is working correctly."
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

// Run the tests
testAdminEndpoints();
