const AdsandLinks = require("../model/AdsandLinks");
const {
  uploadImageToCloudinary,
  deleteImageFromCloudinary,
} = require("../config/cloudinary");

// Get all ads
const getAds = async (req, res) => {
  try {
    const ads = await AdsandLinks.getOrCreateAds();
    res.status(200).json({
      success: true,
      ads: {
        adcode_1: ads.adcode_1,
        adcode_2: ads.adcode_2,
        adcode_3: ads.adcode_3,
        ingamead: ads.ingamead,
        yellowboardad: ads.yellowboardad,
        redboardad: ads.redboardad,
        socialLinks: ads.socialLinks,
      },
    });
  } catch (error) {
    console.error("Error fetching ads:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching ads",
      error: error.message,
    });
  }
};

// Upload single image
const uploadSingleImage = async (req, res) => {
  try {
    const { adType } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    if (!adType) {
      return res.status(400).json({
        success: false,
        message: "Ad type is required",
      });
    }

    // Upload to Cloudinary
    const uploadResult = await uploadImageToCloudinary(file);

    const imageData = {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      uploadedAt: new Date(),
    };

    // Get or create ads document
    const ads = await AdsandLinks.getOrCreateAds();

    // Add image based on type
    if (["adcode_1", "adcode_2", "adcode_3"].includes(adType)) {
      await ads.addAdCodeImage(adType, imageData);
    } else if (["ingamead", "yellowboardad", "redboardad"].includes(adType)) {
      await ads.setBoardAdImage(adType, imageData);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid ad type",
      });
    }

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      uploadedImage: imageData,
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading image",
      error: error.message,
    });
  }
};

// Upload multiple images
const uploadMultipleImages = async (req, res) => {
  try {
    const { adType } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    if (!adType) {
      return res.status(400).json({
        success: false,
        message: "Ad type is required",
      });
    }

    if (!["adcode_1", "adcode_2", "adcode_3"].includes(adType)) {
      return res.status(400).json({
        success: false,
        message: "Multiple images only allowed for ad code types",
      });
    }

    // Upload all images to Cloudinary
    const uploadPromises = files.map((file) => uploadImageToCloudinary(file));
    const uploadResults = await Promise.all(uploadPromises);

    const imageDataArray = uploadResults.map((result) => ({
      url: result.secure_url,
      publicId: result.public_id,
      uploadedAt: new Date(),
    }));

    // Get or create ads document
    const ads = await AdsandLinks.getOrCreateAds();

    // Add all images to the specified ad type
    for (const imageData of imageDataArray) {
      await ads.addAdCodeImage(adType, imageData);
    }

    res.status(200).json({
      success: true,
      message: "Images uploaded successfully",
      uploadedImages: imageDataArray,
    });
  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading images",
      error: error.message,
    });
  }
};

// Delete image
const deleteImage = async (req, res) => {
  try {
    const { adType, imageIndex } = req.body;

    if (!adType) {
      return res.status(400).json({
        success: false,
        message: "Ad type is required",
      });
    }

    const ads = await AdsandLinks.getOrCreateAds();

    if (["adcode_1", "adcode_2", "adcode_3"].includes(adType)) {
      // Delete from array
      if (imageIndex === undefined || imageIndex === null) {
        return res.status(400).json({
          success: false,
          message: "Image index is required for array types",
        });
      }

      const imageToDelete = ads[adType][imageIndex];
      if (!imageToDelete) {
        return res.status(404).json({
          success: false,
          message: "Image not found",
        });
      }

      // Delete from Cloudinary
      try {
        await deleteImageFromCloudinary(imageToDelete.publicId);
      } catch (cloudinaryError) {
        console.error("Error deleting from Cloudinary:", cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }

      await ads.removeAdCodeImage(adType, imageIndex);
    } else if (["ingamead", "yellowboardad", "redboardad"].includes(adType)) {
      // Delete single image
      const imageToDelete = ads[adType];
      if (!imageToDelete) {
        return res.status(404).json({
          success: false,
          message: "Image not found",
        });
      }

      // Delete from Cloudinary
      try {
        await deleteImageFromCloudinary(imageToDelete.publicId);
      } catch (cloudinaryError) {
        console.error("Error deleting from Cloudinary:", cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }

      await ads.removeBoardAdImage(adType);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid ad type",
      });
    }

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting image",
      error: error.message,
    });
  }
};

// Save all ads (update existing)
const saveAds = async (req, res) => {
  try {
    const { ads } = req.body;

    if (!ads) {
      return res.status(400).json({
        success: false,
        message: "Ads data is required",
      });
    }

    const existingAds = await AdsandLinks.getOrCreateAds();

    // Update the ads document
    Object.keys(ads).forEach((key) => {
      if (ads[key] !== undefined) {
        existingAds[key] = ads[key];
      }
    });

    existingAds.lastModifiedBy = req.user?.id;
    await existingAds.save();

    res.status(200).json({
      success: true,
      message: "Ads saved successfully",
    });
  } catch (error) {
    console.error("Error saving ads:", error);
    res.status(500).json({
      success: false,
      message: "Error saving ads",
      error: error.message,
    });
  }
};

// Update social links
const updateSocialLinks = async (req, res) => {
  try {
    const { socialLinks } = req.body;

    if (!socialLinks) {
      return res.status(400).json({
        success: false,
        message: "Social links data is required",
      });
    }

    const ads = await AdsandLinks.getOrCreateAds();
    ads.socialLinks = { ...ads.socialLinks, ...socialLinks };
    ads.lastModifiedBy = req.user?.id;
    await ads.save();

    res.status(200).json({
      success: true,
      message: "Social links updated successfully",
    });
  } catch (error) {
    console.error("Error updating social links:", error);
    res.status(500).json({
      success: false,
      message: "Error updating social links",
      error: error.message,
    });
  }
};

module.exports = {
  getAds,
  uploadSingleImage,
  uploadMultipleImages,
  deleteImage,
  saveAds,
  updateSocialLinks,
};
