const mongoose = require("mongoose");
require("dotenv").config();

// Test script to verify ads endpoints
const testAdsEndpoints = async () => {
  try {
    // Connect to database
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/ludo-game"
    );
    console.log("✅ Connected to MongoDB");

    // Test the AdsandLinks model
    const AdsandLinks = require("./model/AdsandLinks");

    // Test getOrCreateAds method
    console.log("🧪 Testing getOrCreateAds method...");
    const ads = await AdsandLinks.getOrCreateAds();
    console.log("✅ Ads document created/found:", {
      id: ads._id,
      adcode_1: ads.adcode_1.length,
      adcode_2: ads.adcode_2.length,
      adcode_3: ads.adcode_3.length,
      ingamead: ads.ingamead ? "exists" : "null",
      yellowboardad: ads.yellowboardad ? "exists" : "null",
      redboardad: ads.redboardad ? "exists" : "null",
    });

    // Test adding an ad code image
    console.log("🧪 Testing addAdCodeImage method...");
    const testImageData = {
      url: "https://example.com/test-image.jpg",
      publicId: "test-public-id",
      uploadedAt: new Date(),
    };

    await ads.addAdCodeImage("adcode_1", testImageData);
    console.log("✅ Added test image to adcode_1");

    // Test setting a board ad image
    console.log("🧪 Testing setBoardAdImage method...");
    await ads.setBoardAdImage("ingamead", testImageData);
    console.log("✅ Set test image for ingamead");

    // Verify the changes
    const updatedAds = await AdsandLinks.findById(ads._id);
    console.log("✅ Updated ads document:", {
      adcode_1: updatedAds.adcode_1.length,
      ingamead: updatedAds.ingamead ? "exists" : "null",
    });

    // Test removing images
    console.log("🧪 Testing removeAdCodeImage method...");
    await ads.removeAdCodeImage("adcode_1", 0);
    console.log("✅ Removed image from adcode_1");

    console.log("🧪 Testing removeBoardAdImage method...");
    await ads.removeBoardAdImage("ingamead");
    console.log("✅ Removed image from ingamead");

    // Final verification
    const finalAds = await AdsandLinks.findById(ads._id);
    console.log("✅ Final ads document:", {
      adcode_1: finalAds.adcode_1.length,
      ingamead: finalAds.ingamead ? "exists" : "null",
    });

    console.log("🎉 All tests passed! The ads system is working correctly.");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  }
};

// Run the test
testAdsEndpoints();
