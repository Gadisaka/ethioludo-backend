const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { getBotsEnabled } = require("../../controllers/gameSetting.controller");

// Bot configuration constants
const BOT_CONFIG = {
  BOTS_ENABLED: true,

  // Bot joining behavior
  JOIN_DELAY_MS: parseInt(process.env.BOT_JOIN_DELAY_MS) || 40000, // 40 seconds default
  IMMEDIATE_JOIN_DELAY_MS:
    parseInt(process.env.BOT_IMMEDIATE_JOIN_DELAY_MS) || 40000, // 40 seconds default
  MAX_BOTS_PER_GAME: parseInt(process.env.MAX_BOTS_PER_GAME) || 1, // Only 1 bot for 2-player game

  // Bot AI behavior
  MOVE_DELAY_MS: parseInt(process.env.BOT_MOVE_DELAY_MS) || 2000, // 2 seconds default
  DICE_ROLL_DELAY_MS: parseInt(process.env.BOT_DICE_ROLL_DELAY_MS) || 1500, // 1.5 seconds default

  // Bot naming
  NAME_SUFFIX_SEPARATOR: process.env.BOT_NAME_SUFFIX_SEPARATOR || "#",
  MAX_NAME_ATTEMPTS: parseInt(process.env.BOT_MAX_NAME_ATTEMPTS) || 10,

  // Bot colors (will be assigned in order) - 2-player game
  AVAILABLE_COLORS: ["green", "blue"],

  // Bot difficulty levels
  DIFFICULTY_LEVELS: {
    EASY: "easy",
    MEDIUM: "medium",
    HARD: "hard",
  },
};

// Cache for BOTS_ENABLED setting to avoid repeated database calls
let botsEnabledCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 30000; // 30 seconds cache

// Initialize cache on startup
async function initializeCache() {
  try {
    const botsEnabled = await getBotsEnabled();
    updateBotsEnabledCache(botsEnabled);
    console.log(
      `[BotConfig] Cache initialized with BOTS_ENABLED: ${botsEnabled}`
    );
  } catch (error) {
    console.error("[BotConfig] Error initializing cache:", error);
    // Use default value
    updateBotsEnabledCache(BOT_CONFIG.BOTS_ENABLED);
  }
}

// Bot names list - Ethiopian names for more authentic experience
const BOT_NAMES = [
  "Teddy",
  "Aster",
  "Aweke",
  "Mulatu",
  "Astatke",
  "Mahmoud",
  "Ahmed",
  "Tilahun",
  "Afewerk",
  "Tekle",
  "Adam",
  "Tesfaw",
  "Michael",
  "Tsegay",
  "Hailu",
  "Kifle",
  "Yonas",
  "Gessesse",
  "Melesa",
  "Kirubel",
  "Mehari",
  "Teshome",
  "Zelalem",
  "Merga",
  "Lulit",
];

// Environment variable overrides
const ENV_OVERRIDES = {
  BOTS_ENABLED: process.env.BOTS_ENABLED,
  BOT_JOIN_DELAY_MS: process.env.BOT_JOIN_DELAY_MS,
  BOT_IMMEDIATE_JOIN_DELAY_MS: process.env.BOT_IMMEDIATE_JOIN_DELAY_MS,
  MAX_BOTS_PER_GAME: process.env.MAX_BOTS_PER_GAME,
  BOT_MOVE_DELAY_MS: process.env.BOT_MOVE_DELAY_MS,
  BOT_DICE_ROLL_DELAY_MS: process.env.BOT_DICE_ROLL_DELAY_MS,
  BOT_NAME_SUFFIX_SEPARATOR: process.env.BOT_NAME_SUFFIX_SEPARATOR,
  MAX_NAME_ATTEMPTS: process.env.BOT_MAX_NAME_ATTEMPTS,
};

/**
 * Generate a unique bot name that doesn't conflict with existing players
 * @param {Array} existingPlayers - Array of existing player objects with name property
 * @param {Array} existingBotNames - Array of existing bot names to avoid conflicts
 * @returns {string} Unique bot name
 */
function generateUniqueBotName(existingPlayers = [], existingBotNames = []) {
  // Handle null/undefined inputs safely
  const players = existingPlayers || [];
  const botNames = existingBotNames || [];

  const existingNames = new Set([...players.map((p) => p.name), ...botNames]);

  // Get available names (not taken)
  const availableNames = BOT_NAMES.filter((name) => !existingNames.has(name));

  // If we have available names, randomly select one
  if (availableNames.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableNames.length);
    return availableNames[randomIndex];
  }

  // If all original names are taken, add suffix
  for (const botName of BOT_NAMES) {
    for (let attempt = 1; attempt <= BOT_CONFIG.MAX_NAME_ATTEMPTS; attempt++) {
      const suffix = BOT_CONFIG.NAME_SUFFIX_SEPARATOR + attempt;
      const candidateName = botName + suffix;

      if (!existingNames.has(candidateName)) {
        return candidateName;
      }
    }
  }

  // Fallback: generate completely unique name with timestamp
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `Bot_${timestamp}_${randomSuffix}`;
}

/**
 * Get BOTS_ENABLED setting with caching
 * @returns {boolean} Bots enabled status
 */
function getBotsEnabledSync() {
  const now = Date.now();

  // Return cached value if still valid
  if (botsEnabledCache !== null && now - lastCacheUpdate < CACHE_DURATION) {
    return botsEnabledCache;
  }

  // If cache is expired or not set, return default value
  // The async version will update the cache in the background
  return BOT_CONFIG.BOTS_ENABLED;
}

/**
 * Update the BOTS_ENABLED cache
 * @param {boolean} value - New bots enabled value
 */
function updateBotsEnabledCache(value) {
  botsEnabledCache = value;
  lastCacheUpdate = Date.now();
}

/**
 * Get bot configuration with environment variable overrides
 * @returns {Object} Bot configuration object
 */
async function getBotConfig() {
  try {
    // Fetch BOTS_ENABLED from database
    const botsEnabled = await getBotsEnabled();

    // Update cache
    updateBotsEnabledCache(botsEnabled);

    return {
      ...BOT_CONFIG,
      BOTS_ENABLED: botsEnabled,
    };
  } catch (error) {
    console.error("Error fetching bot config from database:", error);
    // Fallback to default config if database fetch fails
    return { ...BOT_CONFIG };
  }
}

/**
 * Get bot configuration synchronously (uses cache)
 * @returns {Object} Bot configuration object
 */
function getBotConfigSync() {
  return {
    ...BOT_CONFIG,
    BOTS_ENABLED: getBotsEnabledSync(),
  };
}

/**
 * Get all available bot names
 * @returns {Array} Array of bot names
 */
function getBotNames() {
  return [...BOT_NAMES];
}

/**
 * Get environment variable overrides
 * @returns {Object} Environment variable overrides
 */
function getEnvOverrides() {
  return { ...ENV_OVERRIDES };
}

module.exports = {
  BOT_CONFIG,
  BOT_NAMES,
  ENV_OVERRIDES,
  generateUniqueBotName,
  getBotConfig,
  getBotConfigSync,
  getBotsEnabledSync,
  updateBotsEnabledCache,
  initializeCache,
  getBotNames,
  getEnvOverrides,
};
