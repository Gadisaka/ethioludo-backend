const mongoose = require("mongoose");

const adsandLinksSchema = new mongoose.Schema({
  // Ad Code Images - Arrays of image URLs
  adcode_1: [
    {
      url: { type: String, required: true },
      publicId: { type: String, required: true }, // Cloudinary public ID for deletion
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  adcode_2: [
    {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  adcode_3: [
    {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],

  // Game Board Ads - Single image URLs
  ingamead: {
    url: { type: String },
    publicId: { type: String },
    uploadedAt: { type: Date },
  },
  yellowboardad: {
    url: { type: String },
    publicId: { type: String },
    uploadedAt: { type: Date },
  },
  redboardad: {
    url: { type: String },
    publicId: { type: String },
    uploadedAt: { type: Date },
  },

  // Ethiogames Homepage Ads - Array of image URLs
  ethiogamesad: [
    {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],

  // Social Links (for future use)
  socialLinks: {
    facebook: { type: String },
    tiktok: { type: String },
    instagram: { type: String },
    youtube: { type: String },
    telegram: { type: String },
  },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

// Pre-save middleware to update the updatedAt field
adsandLinksSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get or create the single ads document
adsandLinksSchema.statics.getOrCreateAds = async function () {
  let ads = await this.findOne();
  if (!ads) {
    ads = new this({
      adcode_1: [],
      adcode_2: [],
      adcode_3: [],
      ethiogamesad: [],
      socialLinks: {},
    });
    await ads.save();
  }
  return ads;
};

// Method to add image to ad code array
adsandLinksSchema.methods.addAdCodeImage = function (adType, imageData) {
  if (["adcode_1", "adcode_2", "adcode_3", "ethiogamesad"].includes(adType)) {
    this[adType].push(imageData);
  }
  return this.save();
};

// Method to set single board ad image
adsandLinksSchema.methods.setBoardAdImage = function (adType, imageData) {
  if (["ingamead", "yellowboardad", "redboardad"].includes(adType)) {
    this[adType] = imageData;
  }
  return this.save();
};

// Method to remove image from ad code array
adsandLinksSchema.methods.removeAdCodeImage = function (adType, imageIndex) {
  if (["adcode_1", "adcode_2", "adcode_3", "ethiogamesad"].includes(adType)) {
    this[adType].splice(imageIndex, 1);
  }
  return this.save();
};

// Method to remove board ad image
adsandLinksSchema.methods.removeBoardAdImage = function (adType) {
  if (["ingamead", "yellowboardad", "redboardad"].includes(adType)) {
    this[adType] = null;
  }
  return this.save();
};

module.exports = mongoose.model("AdsandLinks", adsandLinksSchema);
