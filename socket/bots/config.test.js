const { 
  BOT_CONFIG, 
  BOT_NAMES, 
  ENV_OVERRIDES, 
  generateUniqueBotName, 
  getBotConfig, 
  getBotNames, 
  getEnvOverrides 
} = require('./config');

describe('Bot Configuration Tests', () => {
  
  describe('BOT_NAMES', () => {
    test('should have between 20-50 names as requested', () => {
      expect(BOT_NAMES.length).toBeGreaterThanOrEqual(20);
      expect(BOT_NAMES.length).toBeLessThanOrEqual(50);
    });

    test('should have unique names', () => {
      const uniqueNames = new Set(BOT_NAMES);
      expect(uniqueNames.size).toBe(BOT_NAMES.length);
    });

    test('should not contain empty strings', () => {
      expect(BOT_NAMES.every(name => name && name.trim().length > 0)).toBe(true);
    });

    test('should not contain names with only whitespace', () => {
      expect(BOT_NAMES.every(name => name.trim().length > 0)).toBe(true);
    });

    test('should contain expected name patterns', () => {
      // Check for Greek letters
      expect(BOT_NAMES).toContain('Alpha');
      expect(BOT_NAMES).toContain('Omega');
      
      // Check for space-related names
      expect(BOT_NAMES).toContain('Nova');
      expect(BOT_NAMES).toContain('Galaxy');
      
      // Check for explorer names
      expect(BOT_NAMES).toContain('Pioneer');
      expect(BOT_NAMES).toContain('Captain');
    });
  });

  describe('BOT_CONFIG', () => {
    test('should have required configuration properties', () => {
      expect(BOT_CONFIG).toHaveProperty('JOIN_DELAY_MS');
      expect(BOT_CONFIG).toHaveProperty('MAX_BOTS_PER_GAME');
      expect(BOT_CONFIG).toHaveProperty('MOVE_DELAY_MS');
      expect(BOT_CONFIG).toHaveProperty('DICE_ROLL_DELAY_MS');
      expect(BOT_CONFIG).toHaveProperty('NAME_SUFFIX_SEPARATOR');
      expect(BOT_CONFIG).toHaveProperty('MAX_NAME_ATTEMPTS');
      expect(BOT_CONFIG).toHaveProperty('AVAILABLE_COLORS');
      expect(BOT_CONFIG).toHaveProperty('DIFFICULTY_LEVELS');
    });

    test('should have valid default values', () => {
      expect(BOT_CONFIG.JOIN_DELAY_MS).toBe(30000); // 30 seconds
      expect(BOT_CONFIG.MAX_BOTS_PER_GAME).toBe(3);
      expect(BOT_CONFIG.MOVE_DELAY_MS).toBe(2000); // 2 seconds
      expect(BOT_CONFIG.DICE_ROLL_DELAY_MS).toBe(1500); // 1.5 seconds
      expect(BOT_CONFIG.NAME_SUFFIX_SEPARATOR).toBe('#');
      expect(BOT_CONFIG.MAX_NAME_ATTEMPTS).toBe(10);
    });

    test('should have valid color array', () => {
      expect(Array.isArray(BOT_CONFIG.AVAILABLE_COLORS)).toBe(true);
      expect(BOT_CONFIG.AVAILABLE_COLORS).toContain('red');
      expect(BOT_CONFIG.AVAILABLE_COLORS).toContain('green');
      expect(BOT_CONFIG.AVAILABLE_COLORS).toContain('blue');
      expect(BOT_CONFIG.AVAILABLE_COLORS).toContain('yellow');
    });

    test('should have valid difficulty levels', () => {
      expect(BOT_CONFIG.DIFFICULTY_LEVELS).toHaveProperty('EASY');
      expect(BOT_CONFIG.DIFFICULTY_LEVELS).toHaveProperty('MEDIUM');
      expect(BOT_CONFIG.DIFFICULTY_LEVELS).toHaveProperty('HARD');
    });
  });

  describe('ENV_OVERRIDES', () => {
    test('should have all environment variable properties', () => {
      expect(ENV_OVERRIDES).toHaveProperty('BOT_JOIN_DELAY_MS');
      expect(ENV_OVERRIDES).toHaveProperty('MAX_BOTS_PER_GAME');
      expect(ENV_OVERRIDES).toHaveProperty('BOT_MOVE_DELAY_MS');
      expect(ENV_OVERRIDES).toHaveProperty('BOT_DICE_ROLL_DELAY_MS');
      expect(ENV_OVERRIDES).toHaveProperty('BOT_NAME_SUFFIX_SEPARATOR');
      expect(ENV_OVERRIDES).toHaveProperty('MAX_NAME_ATTEMPTS');
    });
  });

  describe('generateUniqueBotName', () => {
    test('should return a name from BOT_NAMES when no conflicts exist', () => {
      const result = generateUniqueBotName([], []);
      expect(BOT_NAMES).toContain(result);
    });

    test('should avoid conflicts with existing players', () => {
      const existingPlayers = [{ name: 'Alpha' }, { name: 'Beta' }];
      const result = generateUniqueBotName(existingPlayers, []);
      expect(result).not.toBe('Alpha');
      expect(result).not.toBe('Beta');
      expect(BOT_NAMES).toContain(result);
    });

    test('should avoid conflicts with existing bot names', () => {
      const existingBotNames = ['Gamma', 'Delta'];
      const result = generateUniqueBotName([], existingBotNames);
      expect(result).not.toBe('Gamma');
      expect(result).not.toBe('Delta');
      expect(BOT_NAMES).toContain(result);
    });

    test('should add suffix when all original names are taken', () => {
      const allNamesTaken = BOT_NAMES.map(name => ({ name }));
      const result = generateUniqueBotName(allNamesTaken, []);
      
      // Should have suffix format: Name#
      expect(result).toMatch(/^[A-Za-z]+#\d+$/);
      expect(result).toContain(BOT_CONFIG.NAME_SUFFIX_SEPARATOR);
    });

    test('should handle mixed conflicts (players + bots)', () => {
      const existingPlayers = [{ name: 'Alpha' }];
      const existingBotNames = ['Beta', 'Gamma'];
      const result = generateUniqueBotName(existingPlayers, existingBotNames);
      
      expect(result).not.toBe('Alpha');
      expect(result).not.toBe('Beta');
      expect(result).not.toBe('Gamma');
      expect(BOT_NAMES).toContain(result);
    });

    test('should generate fallback name when all attempts exhausted', () => {
      // Create a scenario where all names + suffixes are taken
      const allNamesTaken = BOT_NAMES.map(name => ({ name }));
      const allSuffixesTaken = [];
      
      // Fill up all possible suffix combinations
      for (const botName of BOT_NAMES) {
        for (let i = 1; i <= BOT_CONFIG.MAX_NAME_ATTEMPTS; i++) {
          allSuffixesTaken.push(botName + BOT_CONFIG.NAME_SUFFIX_SEPARATOR + i);
        }
      }
      
      const result = generateUniqueBotName(allNamesTaken, allSuffixesTaken);
      
      // Should be a fallback name with timestamp and random suffix
      expect(result).toMatch(/^Bot_[a-z0-9]+_[a-z0-9]+$/);
      expect(result).not.toBe('Alpha');
      expect(result).not.toBe('Alpha#1');
    });

    test('should handle edge case with empty arrays', () => {
      const result = generateUniqueBotName([], []);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle edge case with null/undefined players', () => {
      const result = generateUniqueBotName(null, undefined);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getBotConfig', () => {
    test('should return a copy of BOT_CONFIG', () => {
      const result = getBotConfig();
      expect(result).toEqual(BOT_CONFIG);
      expect(result).not.toBe(BOT_CONFIG); // Should be a copy, not reference
    });

    test('should not modify original BOT_CONFIG when result is modified', () => {
      const originalConfig = { ...BOT_CONFIG };
      const result = getBotConfig();
      result.JOIN_DELAY_MS = 99999;
      
      expect(BOT_CONFIG.JOIN_DELAY_MS).toBe(originalConfig.JOIN_DELAY_MS);
      expect(result.JOIN_DELAY_MS).toBe(99999);
    });
  });

  describe('getBotNames', () => {
    test('should return a copy of BOT_NAMES', () => {
      const result = getBotNames();
      expect(result).toEqual(BOT_NAMES);
      expect(result).not.toBe(BOT_NAMES); // Should be a copy, not reference
    });

    test('should not modify original BOT_NAMES when result is modified', () => {
      const originalNames = [...BOT_NAMES];
      const result = getBotNames();
      result.push('TestName');
      
      expect(BOT_NAMES).toEqual(originalNames);
      expect(result).toContain('TestName');
      expect(BOT_NAMES).not.toContain('TestName');
    });
  });

  describe('getEnvOverrides', () => {
    test('should return a copy of ENV_OVERRIDES', () => {
      const result = getEnvOverrides();
      expect(result).toEqual(ENV_OVERRIDES);
      expect(result).not.toBe(ENV_OVERRIDES); // Should be a copy, not reference
    });

    test('should not modify original ENV_OVERRIDES when result is modified', () => {
      const originalOverrides = { ...ENV_OVERRIDES };
      const result = getEnvOverrides();
      result.BOT_JOIN_DELAY_MS = '99999';
      
      expect(ENV_OVERRIDES.BOT_JOIN_DELAY_MS).toBe(originalOverrides.BOT_JOIN_DELAY_MS);
      expect(result.BOT_JOIN_DELAY_MS).toBe('99999');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complex conflict scenarios', () => {
      // Simulate a real game scenario with multiple conflicts
      const existingPlayers = [
        { name: 'Alpha' },
        { name: 'Beta' },
        { name: 'Gamma' }
      ];
      
      const existingBotNames = [
        'Delta',
        'Epsilon',
        'Alpha#1',
        'Beta#1'
      ];
      
      const result = generateUniqueBotName(existingPlayers, existingBotNames);
      
      // Result should not be any of the conflicting names
      const allConflicts = [
        'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Alpha#1', 'Beta#1'
      ];
      
      expect(allConflicts).not.toContain(result);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should maintain consistency across multiple calls', () => {
      const existingPlayers = [{ name: 'Alpha' }];
      const existingBotNames = ['Beta'];
      
      const result1 = generateUniqueBotName(existingPlayers, existingBotNames);
      const result2 = generateUniqueBotName(existingPlayers, existingBotNames);
      
      // Both results should be valid and not conflict
      expect(result1).not.toBe('Alpha');
      expect(result1).not.toBe('Beta');
      expect(result2).not.toBe('Alpha');
      expect(result2).not.toBe('Beta');
      
      // Both should be from BOT_NAMES (since we only have 2 conflicts)
      expect(BOT_NAMES).toContain(result1);
      expect(BOT_NAMES).toContain(result2);
    });
  });
});
