#!/usr/bin/env node

/**
 * Comprehensive Bot Test Runner
 *
 * This script runs all bot-related tests and provides detailed reporting
 * on test results, performance, and any issues found.
 */

const { spawn } = require("child_process");
const path = require("path");

// Test configuration
const TEST_CONFIG = {
  unit: {
    name: "Unit Tests",
    pattern: "socket/bots/ai/hard.test.js",
    timeout: 30000,
  },
  integration: {
    name: "Integration Tests",
    pattern: "socket/bots/integration.test.js",
    timeout: 60000,
  },
  race: {
    name: "Race Condition Tests",
    pattern: "socket/bots/race.test.js",
    timeout: 60000,
  },
  simulation: {
    name: "End-to-End Simulation Tests",
    pattern: "socket/bots/simulation.test.js",
    timeout: 120000,
  },
};

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// Test results storage
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  duration: 0,
  startTime: null,
  endTime: null,
};

// Performance metrics
const performanceMetrics = {
  memoryUsage: [],
  cpuUsage: [],
  testDurations: {},
};

/**
 * Print colored output
 */
function printColor(color, text) {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

/**
 * Print header
 */
function printHeader() {
  console.log("\n" + "=".repeat(80));
  printColor("bright", "🤖 BOT TEST SUITE RUNNER");
  console.log("=".repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Node version: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log("=".repeat(80) + "\n");
}

/**
 * Print test section header
 */
function printTestSection(testType) {
  const config = TEST_CONFIG[testType];
  console.log("\n" + "-".repeat(60));
  printColor("blue", `🧪 ${config.name}`);
  console.log("-".repeat(60));
}

/**
 * Run a single test suite
 */
function runTest(testType) {
  return new Promise((resolve, reject) => {
    const config = TEST_CONFIG[testType];
    const startTime = Date.now();

    printTestSection(testType);

    // Spawn Jest process
    const jestProcess = spawn("npm", ["test", "--", config.pattern], {
      stdio: "pipe",
      shell: true,
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    // Collect output
    jestProcess.stdout.on("data", (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    jestProcess.stderr.on("data", (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    // Handle completion
    jestProcess.on("close", (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;

      // Parse Jest output for test counts
      const testMatch = stdout.match(
        /(\d+) passed, (\d+) failed, (\d+) skipped/
      );
      if (testMatch) {
        const [, passed, failed, skipped] = testMatch.map(Number);
        testResults.passed += passed;
        testResults.failed += failed;
        testResults.skipped += skipped;
        testResults.total += passed + failed + skipped;
      }

      performanceMetrics.testDurations[testType] = duration;

      if (success) {
        printColor(
          "green",
          `✅ ${config.name} completed successfully in ${duration}ms`
        );
      } else {
        printColor("red", `❌ ${config.name} failed after ${duration}ms`);
      }

      resolve({ success, duration, stdout, stderr });
    });

    // Handle timeout
    setTimeout(() => {
      jestProcess.kill("SIGTERM");
      reject(new Error(`${config.name} timed out after ${config.timeout}ms`));
    }, config.timeout);

    // Handle errors
    jestProcess.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Run all tests sequentially
 */
async function runAllTests() {
  testResults.startTime = Date.now();

  try {
    // Run tests in order
    for (const testType of Object.keys(TEST_CONFIG)) {
      try {
        await runTest(testType);
      } catch (error) {
        printColor(
          "red",
          `❌ Error running ${TEST_CONFIG[testType].name}: ${error.message}`
        );
        testResults.failed++;
      }
    }
  } catch (error) {
    printColor("red", `❌ Fatal error: ${error.message}`);
  }

  testResults.endTime = Date.now();
  testResults.duration = testResults.endTime - testResults.startTime;
}

/**
 * Print test summary
 */
function printSummary() {
  console.log("\n" + "=".repeat(80));
  printColor("bright", "📊 TEST SUMMARY");
  console.log("=".repeat(80));

  // Overall results
  console.log(`Total Tests: ${testResults.total}`);
  printColor("green", `Passed: ${testResults.passed}`);
  printColor("red", `Failed: ${testResults.failed}`);
  printColor("yellow", `Skipped: ${testResults.skipped}`);

  // Success rate
  if (testResults.total > 0) {
    const successRate = (
      (testResults.passed / testResults.total) *
      100
    ).toFixed(1);
    printColor("cyan", `Success Rate: ${successRate}%`);
  }

  // Duration
  console.log(`Total Duration: ${testResults.duration}ms`);

  // Performance breakdown
  console.log("\nPerformance Breakdown:");
  Object.entries(performanceMetrics.testDurations).forEach(
    ([testType, duration]) => {
      const config = TEST_CONFIG[testType];
      console.log(`  ${config.name}: ${duration}ms`);
    }
  );

  // Memory usage
  const memUsage = process.memoryUsage();
  console.log("\nMemory Usage:");
  console.log(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
  );
  console.log(
    `  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
  );

  console.log("=".repeat(80));
}

/**
 * Print recommendations
 */
function printRecommendations() {
  console.log("\n" + "=".repeat(80));
  printColor("bright", "💡 RECOMMENDATIONS");
  console.log("=".repeat(80));

  if (testResults.failed === 0) {
    printColor(
      "green",
      "🎉 All tests passed! Your bot implementation is working correctly."
    );
    console.log("  • Consider running performance tests under load");
    console.log("  • Monitor memory usage in production");
    console.log("  • Test with different game configurations");
  } else {
    printColor("yellow", "⚠️  Some tests failed. Please review the issues:");
    console.log("  • Check test output for specific error messages");
    console.log("  • Verify bot logic implementation");
    console.log("  • Check for race conditions or timing issues");
    console.log("  • Ensure all dependencies are properly mocked");
  }

  if (testResults.duration > 60000) {
    printColor("yellow", "⏱️  Tests are running slowly. Consider:");
    console.log("  • Running tests in parallel where possible");
    console.log("  • Optimizing test setup and teardown");
    console.log("  • Reducing timeout values for faster failure detection");
  }

  console.log("=".repeat(80));
}

/**
 * Main execution
 */
async function main() {
  try {
    printHeader();
    await runAllTests();
    printSummary();
    printRecommendations();

    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (error) {
    printColor("red", `❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runAllTests,
  printSummary,
  printRecommendations,
};
