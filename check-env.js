require("dotenv").config();

console.log("🔍 Environment Variables Check:");
console.log("=================================");
console.log("MONGO_URI:", process.env.MONGO_URI ? "✅ Set" : "❌ Not Set");
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "✅ Set" : "❌ Not Set");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "✅ Set" : "❌ Not Set");
console.log("PORT:", process.env.PORT || "Not Set (will use default)");
console.log("NODE_ENV:", process.env.NODE_ENV || "Not Set");

if (process.env.MONGO_URI) {
  console.log("\n🔌 MONGO_URI value:", process.env.MONGO_URI);
} else if (process.env.MONGODB_URI) {
  console.log("\n🔌 MONGODB_URI value:", process.env.MONGODB_URI);
} else {
  console.log("\n❌ No MongoDB URI found in environment variables!");
  console.log("Please set either MONGO_URI or MONGODB_URI in your .env file");
}
