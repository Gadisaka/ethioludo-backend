const axios = require("axios");

const testAdminLogin = async () => {
  try {
    console.log("🔐 Testing admin login...");

    const response = await axios.post("http://localhost:4002/auth/login", {
      phone: "0911111111",
      password: "admin123",
      role: "ADMIN",
    });

    console.log("✅ Login successful!");
    console.log("Token:", response.data.token);
    console.log("User:", response.data.user);

    // Test the bank endpoint with the token
    console.log("\n🏦 Testing bank endpoint with admin token...");

    const bankResponse = await axios.patch(
      "http://localhost:4002/banks/68c1de3f5f397fc2053dd1c0/details",
      {
        number: "1000123456789",
        accountFullName: "Ludo King Admin - Commercial Bank of Ethiopia",
      },
      {
        headers: {
          Authorization: `Bearer ${response.data.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Bank update successful!");
    console.log("Response:", bankResponse.data);
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
};

testAdminLogin();
