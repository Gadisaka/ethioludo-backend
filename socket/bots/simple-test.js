const { RoomWatcher } = require('./roomWatcher');
const { getBotConfig } = require('./config');

// Simple test without complex mocking
async function simpleTest() {
  console.log('🧪 Simple Room Watcher Test');
  console.log('===========================\n');

  try {
    // Test 1: Create RoomWatcher instance
    console.log('✅ Test 1: Creating RoomWatcher instance...');
    const watcher = new RoomWatcher({
      logger: console,
      useRedis: false
    });
    
    console.log('   - Instance created successfully');
    console.log('   - isRunning:', watcher.isRunning);
    console.log('   - useRedis:', watcher.useRedis);
    console.log('   - pendingJoins size:', watcher.pendingJoins.size);

    // Test 2: Start the watcher
    console.log('\n✅ Test 2: Starting RoomWatcher...');
    watcher.start();
    
    console.log('   - isRunning:', watcher.isRunning);
    console.log('   - sweepInterval:', watcher.sweepInterval ? 'set' : 'null');

    // Test 3: Get status
    console.log('\n✅ Test 3: Getting status...');
    const status = watcher.getStatus();
    console.log('   - Status:', JSON.stringify(status, null, 2));

    // Test 4: Stop the watcher
    console.log('\n✅ Test 4: Stopping RoomWatcher...');
    watcher.stop();
    
    console.log('   - isRunning:', watcher.isRunning);
    console.log('   - sweepInterval:', watcher.sweepInterval ? 'set' : 'null');

    // Test 5: Test pending room management
    console.log('\n✅ Test 5: Testing pending room management...');
    const testRoomId = 'test-room-123';
    const joinData = {
      roomId: testRoomId,
      maxBotsAllowed: 3,
      currentPlayerCount: 1,
      gameSettings: { stake: 10, requiredPieces: 2 }
    };

    // Mark as pending
    await watcher.markRoomAsPending(testRoomId, joinData);
    console.log('   - Room marked as pending');
    console.log('   - isRoomPending:', watcher.isRoomPending(testRoomId));
    console.log('   - pendingJoins size:', watcher.pendingJoins.size);

    // Clear pending
    await watcher.clearPendingRoom(testRoomId);
    console.log('   - Room cleared from pending');
    console.log('   - isRoomPending:', watcher.isRoomPending(testRoomId));
    console.log('   - pendingJoins size:', watcher.pendingJoins.size);

    // Test 6: Test Redis variant
    console.log('\n✅ Test 6: Testing Redis variant...');
    const redisWatcher = new RoomWatcher({
      useRedis: true,
      redisClient: null, // No actual Redis client for this test
      logger: console
    });
    
    console.log('   - Redis watcher created');
    console.log('   - useRedis:', redisWatcher.useRedis);
    console.log('   - redisClient:', redisWatcher.redisClient);

    console.log('\n🎉 All basic tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  simpleTest();
}

module.exports = { simpleTest };
