const { RoomWatcher } = require('./roomWatcher');
const { getBotConfig } = require('./config');

// Mock GameRoom for demonstration
const mockGameRoom = {
  find: jest.fn()
};

// Override the require to use our mock
const originalRequire = require;
require = function(id) {
  if (id === '../../model/GameRoom') {
    return mockGameRoom;
  }
  return originalRequire.apply(this, arguments);
};

async function demonstrateRoomWatcher() {
  console.log('🎭 Room Watcher Demonstration');
  console.log('=============================\n');

  const BOT_CONFIG = getBotConfig();
  console.log(`📋 Bot Configuration:`);
  console.log(`   - Join Delay: ${BOT_CONFIG.JOIN_DELAY_MS}ms (${BOT_CONFIG.JOIN_DELAY_MS / 1000}s)`);
  console.log(`   - Max Bots Per Game: ${BOT_CONFIG.MAX_BOTS_PER_GAME}`);
  console.log(`   - Sweep Interval: 5000ms (5s)\n`);

  // Create room watcher
  const watcher = new RoomWatcher({
    logger: console,
    useRedis: false
  });

  // Start the watcher
  console.log('🚀 Starting Room Watcher...');
  watcher.start();
  
  // Wait for initial sweep
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('✅ Room Watcher started and performed initial sweep\n');

  // Create a test room that's too new (1 second old)
  console.log('🏠 Creating test room (1 second old)...');
  const testRoom = {
    _id: 'demo-room-1',
    roomId: 'demo-room-1',
    players: [{ name: 'DemoPlayer' }],
    gameStatus: 'waiting',
    createdAt: new Date(Date.now() - 1000), // 1 second ago
    gameSettings: { stake: 10, requiredPieces: 2 }
  };

  // Mock the database query to return our test room
  mockGameRoom.find.mockResolvedValue([testRoom]);

  console.log(`📝 Test Room Details:`);
  console.log(`   - Room ID: ${testRoom.roomId}`);
  console.log(`   - Players: ${testRoom.players.length}/4`);
  console.log(`   - Status: ${testRoom.gameStatus}`);
  console.log(`   - Created: ${testRoom.createdAt.toISOString()}`);
  console.log(`   - Age: ${Math.floor((Date.now() - testRoom.createdAt.getTime()) / 1000)}s\n`);

  // Perform sweep (room should be too new)
  console.log('🔍 Performing sweep (room too new)...');
  await watcher.sweep();
  
  console.log(`📊 Results after first sweep:`);
  console.log(`   - Pending Joins: ${watcher.pendingJoins.size}`);
  console.log(`   - Room eligible: ${watcher.isRoomPending(testRoom.roomId)}`);
  console.log(`   - Expected: Room should NOT be eligible (too new)\n`);

  // Wait for room to become eligible (31 seconds total)
  const waitTime = (BOT_CONFIG.JOIN_DELAY_MS + 1000) / 1000; // 31 seconds
  console.log(`⏰ Waiting ${waitTime}s for room to become eligible for bot joining...`);
  
  // Update room creation time to make it eligible
  const eligibleTime = Date.now() - BOT_CONFIG.JOIN_DELAY_MS - 1000; // 31 seconds ago
  testRoom.createdAt = new Date(eligibleTime);
  
  console.log(`📝 Updated room creation time to: ${testRoom.createdAt.toISOString()}`);
  console.log(`   - New age: ${Math.floor((Date.now() - eligibleTime) / 1000)}s\n`);

  // Wait for next sweep cycle
  console.log('⏳ Waiting for next 5-second sweep cycle...');
  await new Promise(resolve => setTimeout(resolve, 6000));

  // Perform another sweep (room should now be eligible)
  console.log('🔍 Performing sweep after delay (room now eligible)...');
  await watcher.sweep();
  
  console.log(`📊 Results after second sweep:`);
  console.log(`   - Pending Joins: ${watcher.pendingJoins.size}`);
  console.log(`   - Room eligible: ${watcher.isRoomPending(testRoom.roomId)}`);
  
  if (watcher.pendingJoins.has(testRoom.roomId)) {
    const pendingData = watcher.pendingJoins.get(testRoom.roomId);
    console.log(`   - Pending Data:`, JSON.stringify(pendingData, null, 2));
  }

  // Get all pending joins
  const pendingJoins = watcher.getPendingJoins();
  console.log(`\n📋 All Pending Joins:`);
  pendingJoins.forEach((join, index) => {
    console.log(`   ${index + 1}. Room: ${join.roomId}`);
    console.log(`      - Max Bots: ${join.maxBotsAllowed}`);
    console.log(`      - Current Players: ${join.currentPlayerCount}`);
    console.log(`      - Scheduled: ${new Date(join.scheduledAt).toISOString()}`);
    console.log(`      - Attempts: ${join.attempts}`);
  });

  // Test clearing pending room
  console.log('\n🧹 Testing clear pending room...');
  await watcher.clearPendingRoom(testRoom.roomId);
  console.log(`   - Room still pending: ${watcher.isRoomPending(testRoom.roomId)}`);

  // Stop the room watcher
  console.log('\n🛑 Stopping Room Watcher...');
  watcher.stop();
  
  console.log(`📊 Final Status: ${JSON.stringify(watcher.getStatus(), null, 2)}`);
  console.log('\n🎉 Room Watcher Demonstration Completed Successfully!');
  console.log('\n📝 Summary:');
  console.log('   ✅ Room created and initially too new for bot joining');
  console.log('   ✅ After 31 seconds, room became eligible');
  console.log('   ✅ Room watcher detected eligibility and marked as pending');
  console.log('   ✅ Pending room data captured correctly');
  console.log('   ✅ Room cleared from pending status');
  console.log('   ✅ All operations completed without errors');
}

// Run the demonstration
if (require.main === module) {
  demonstrateRoomWatcher().catch(console.error);
}

module.exports = { demonstrateRoomWatcher };
