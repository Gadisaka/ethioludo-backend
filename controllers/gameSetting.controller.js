const GameSetting = require("../model/gameSetting");
const { updateBotsEnabledCache } = require("../socket/bots/config");

// Get all game settings
const getAllSettings = async (req, res) => {
  try {
    const settings = await GameSetting.find({ isActive: true })
      .populate("lastUpdatedBy", "username")
      .sort({ settingKey: 1 });

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching game settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch game settings",
      error: error.message,
    });
  }
};

// Get a specific setting by key
const getSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await GameSetting.findOne({
      settingKey: key,
      isActive: true,
    }).populate("lastUpdatedBy", "username");

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: `Setting '${key}' not found`,
      });
    }

    res.status(200).json({
      success: true,
      data: setting,
    });
  } catch (error) {
    console.error("Error fetching game setting:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch game setting",
      error: error.message,
    });
  }
};

// Update a game setting
const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;
    const updatedBy = req.user?.id; // Assuming user is attached to request

    // Validate required fields
    if (value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        message: "Setting value is required",
      });
    }

    // Validate specific settings
    if (key === "GAME_CUT_PERCENTAGE") {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        return res.status(400).json({
          success: false,
          message: "Cut percentage must be a number between 0 and 100",
        });
      }
    }

    if (key === "BOTS_ENABLED") {
      if (typeof value !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Bots enabled must be a boolean value (true or false)",
        });
      }
    }

    const updateData = {
      settingKey: key,
      settingValue: value,
      lastUpdatedBy: updatedBy,
      isActive: true,
    };

    if (description) {
      updateData.description = description;
    }

    const setting = await GameSetting.findOneAndUpdate(
      { settingKey: key },
      updateData,
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    ).populate("lastUpdatedBy", "username");

    // Update cache if BOTS_ENABLED was updated
    if (key === "BOTS_ENABLED") {
      updateBotsEnabledCache(Boolean(value));
    }

    res.status(200).json({
      success: true,
      message: `Setting '${key}' updated successfully`,
      data: setting,
    });
  } catch (error) {
    console.error("Error updating game setting:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update game setting",
      error: error.message,
    });
  }
};

// Create multiple default settings
const initializeDefaultSettings = async (req, res) => {
  try {
    const defaultSettings = [
      {
        settingKey: "GAME_CUT_PERCENTAGE",
        settingValue: 10,
        description: "Percentage cut taken from game winnings",
      },
      {
        settingKey: "BOT_DIFFICULTY",
        settingValue: "medium",
        description: "Default bot difficulty level",
      },
      {
        settingKey: "MAX_PLAYERS",
        settingValue: 4,
        description: "Maximum players allowed in a game",
      },
      {
        settingKey: "MIN_STAKE",
        settingValue: 10,
        description: "Minimum stake amount for games",
      },
      {
        settingKey: "MAX_STAKE",
        settingValue: 1000,
        description: "Maximum stake amount for games",
      },
      {
        settingKey: "BOTS_ENABLED",
        settingValue: false,
        description: "Enable or disable bot players in games",
      },
    ];

    const results = [];
    for (const settingData of defaultSettings) {
      try {
        const existingSetting = await GameSetting.findOne({
          settingKey: settingData.settingKey,
        });

        if (!existingSetting) {
          const setting = await GameSetting.create(settingData);
          results.push(setting);
        }
      } catch (error) {
        console.error(
          `Error creating setting ${settingData.settingKey}:`,
          error
        );
      }
    }

    res.status(200).json({
      success: true,
      message: `Initialized ${results.length} default settings`,
      data: results,
    });
  } catch (error) {
    console.error("Error initializing default settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize default settings",
      error: error.message,
    });
  }
};

// Get cut percentage specifically (for internal use)
const getCutPercentage = async () => {
  try {
    const cutPercentage = await GameSetting.getSetting(
      "GAME_CUT_PERCENTAGE",
      10
    );
    return parseFloat(cutPercentage);
  } catch (error) {
    console.error("Error getting cut percentage:", error);
    return 10; // Default fallback
  }
};

// Get bots enabled setting specifically (for internal use)
const getBotsEnabled = async () => {
  try {
    const botsEnabled = await GameSetting.getSetting("BOTS_ENABLED", false);
    return Boolean(botsEnabled);
  } catch (error) {
    console.error("Error getting bots enabled setting:", error);
    return false; // Default fallback
  }
};

module.exports = {
  getAllSettings,
  getSetting,
  updateSetting,
  initializeDefaultSettings,
  getCutPercentage,
  getBotsEnabled,
};
