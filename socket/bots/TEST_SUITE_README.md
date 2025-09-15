# Bot Test Suite

This directory contains comprehensive tests for the Ludo bot system, covering unit tests, integration tests, race condition tests, and end-to-end simulations.

## 🧪 Test Categories

### 1. Unit Tests (`ai/hard.test.js`)

- **Purpose**: Test individual HardAI methods and logic
- **Coverage**:
  - `scoreMove` function with kill/safe/finish scenarios
  - `estimateRiskAfterMove` with various risk calculations
  - Move selection algorithms
  - Scoring heuristics
  - Utility functions

### 2. Integration Tests (`integration.test.js`)

- **Purpose**: Test bot joining across 1000 rooms
- **Coverage**:
  - Mass room creation and bot joining
  - Concurrent bot joins to same room
  - Data consistency across multiple rooms
  - Bot controller integration
  - Error handling and recovery
  - Performance and scalability

### 3. Race Condition Tests (`race.test.js`)

- **Purpose**: Test 50 concurrent join requests for atomic behavior
- **Coverage**:
  - Concurrent join race conditions
  - Duplicate bot name prevention
  - Redis lock contention handling
  - Data consistency during high concurrency
  - Edge case race conditions

### 4. End-to-End Simulation Tests (`simulation.test.js`)

- **Purpose**: Simulate full bot games with kings=1..4
- **Coverage**:
  - Complete game simulation
  - Different king count strategies
  - Game state consistency
  - Bot replacement by humans
  - Performance and stability

## 🚀 Running Tests

### Quick Commands

```bash
# Run all bot tests
npm run test:bots

# Run specific test categories
npm run test:integration    # Integration tests only
npm run test:race          # Race condition tests only
npm run test:simulation    # Simulation tests only

# Run with watch mode
npm run test:bots:watch

# Run end-to-end simulation
npm run simulate:bots
```

### Advanced Commands

```bash
# Run with verbose output
npm test -- socket/bots/ --verbose

# Run specific test file
npm test -- socket/bots/ai/hard.test.js

# Run with coverage
npm test -- socket/bots/ --coverage

# Run tests in sequence (for simulation tests)
npm test -- socket/bots/simulation.test.js --runInBand
```

### Custom Test Runner

```bash
# Run comprehensive test suite with detailed reporting
node scripts/test-bots.js
```

## 📊 What to Watch For

### ✅ Success Indicators

- **All tests pass** with green checkmarks
- **No server crashes** during high concurrency tests
- **Consistent bot names** - no duplicates across tests
- **Proper human replacement** - bots are correctly replaced when humans join
- **Atomic operations** - race condition tests complete without data corruption
- **Performance** - tests complete within reasonable timeframes

### ⚠️ Warning Signs

- **Test failures** - investigate specific error messages
- **Slow performance** - tests taking longer than expected
- **Memory leaks** - increasing memory usage across test runs
- **Duplicate bot names** - indicates naming collision issues
- **Race condition failures** - suggests atomicity problems
- **Server crashes** - indicates stability issues

### 🔍 Key Metrics to Monitor

#### Performance Metrics

- **Test execution time**: Should be reasonable (< 2 minutes for full suite)
- **Memory usage**: Should remain stable across test runs
- **Concurrent operations**: Should handle 50+ concurrent requests
- **Room creation**: Should handle 1000+ rooms efficiently

#### Data Integrity Metrics

- **Bot name uniqueness**: 100% unique names across all tests
- **Room constraints**: Never exceed maxPlayers limit
- **State consistency**: Game state remains valid throughout
- **Atomic operations**: No partial updates or data corruption

#### Stability Metrics

- **No crashes**: Server remains stable under load
- **Error handling**: Graceful degradation under failure conditions
- **Resource cleanup**: Proper cleanup after tests complete
- **Recovery**: System recovers from simulated failures

## 🛠️ Test Configuration

### Timeouts

- **Unit tests**: 30 seconds
- **Integration tests**: 60 seconds
- **Race condition tests**: 60 seconds
- **Simulation tests**: 120 seconds

### Concurrency Limits

- **Integration tests**: 1000 rooms
- **Race condition tests**: 50 concurrent requests
- **Simulation tests**: 4 concurrent games

### Memory Limits

- **Expected RSS**: < 500MB
- **Expected heap**: < 200MB
- **Memory growth**: < 10% per test run

## 🔧 Troubleshooting

### Common Issues

#### Tests Failing

```bash
# Check specific test output
npm test -- socket/bots/ai/hard.test.js --verbose

# Run with debug logging
DEBUG=* npm test -- socket/bots/
```

#### Performance Issues

```bash
# Run tests sequentially
npm test -- socket/bots/ --runInBand

# Check memory usage
node --inspect scripts/test-bots.js
```

#### Race Condition Failures

```bash
# Increase timeout for race tests
npm test -- socket/bots/race.test.js --testTimeout=120000

# Run with reduced concurrency
# Modify race.test.js to reduce concurrentRequests
```

### Debug Mode

```bash
# Enable Jest debug output
npm test -- socket/bots/ --verbose --detectOpenHandles

# Run with Node inspector
node --inspect-brk node_modules/.bin/jest socket/bots/
```

## 📈 Continuous Integration

### GitHub Actions Example

```yaml
- name: Run Bot Tests
  run: |
    npm run test:bots
    npm run simulate:bots
  timeout-minutes: 10
```

### Pre-commit Hooks

```bash
# Add to package.json scripts
"precommit": "npm run test:bots"
```

## 🎯 Test Development

### Adding New Tests

1. **Unit tests**: Add to appropriate `*.test.js` file
2. **Integration tests**: Add to `integration.test.js`
3. **Race condition tests**: Add to `race.test.js`
4. **Simulation tests**: Add to `simulation.test.js`

### Test Patterns

```javascript
// Unit test pattern
it("should handle specific scenario", () => {
  // Arrange
  const input = createTestInput();

  // Act
  const result = functionUnderTest(input);

  // Assert
  expect(result).toBe(expectedOutput);
});

// Integration test pattern
it("should integrate multiple components", async () => {
  // Setup
  const components = await setupComponents();

  // Execute
  const result = await executeIntegration(components);

  // Verify
  expect(result).toMatchIntegrationExpectations();
});
```

### Mocking Guidelines

- **External dependencies**: Mock database, Redis, Socket.io
- **Time-based operations**: Mock timers and delays
- **Random operations**: Mock Math.random for deterministic tests
- **Async operations**: Use proper async/await patterns

## 📚 Additional Resources

### Documentation

- [Hard AI Implementation](./ai/HARD_AI_IMPLEMENTATION.md)
- [Bot Controller Implementation](./BOT_CONTROLLER_IMPLEMENTATION.md)
- [Bot Replacement Implementation](./BOT_REPLACEMENT_IMPLEMENTATION.md)

### Related Tests

- [Bot Joining Tests](./joinBot.test.js)
- [Bot Controller Tests](./controller.test.js)
- [Bot Replacement Tests](./botReplacement.test.js)

### Performance Benchmarks

- **Target**: Complete test suite in < 2 minutes
- **Concurrency**: Handle 50+ concurrent operations
- **Scalability**: Support 1000+ rooms
- **Memory**: < 500MB peak usage

## 🚨 Emergency Procedures

### If Tests Crash

1. **Stop all test processes**
2. **Check system resources** (CPU, memory, disk)
3. **Review recent changes** to bot implementation
4. **Run minimal test set** to isolate issue
5. **Check logs** for error details

### If Performance Degrades

1. **Monitor resource usage**
2. **Check for memory leaks**
3. **Review test timeouts**
4. **Consider test parallelization**
5. **Optimize test setup/teardown**

### If Data Corruption Occurs

1. **Verify atomic operations**
2. **Check race condition handling**
3. **Review locking mechanisms**
4. **Test with reduced concurrency**
5. **Add additional assertions**

---

**Remember**: These tests are designed to catch issues before they reach production. Run them regularly and investigate any failures immediately.
