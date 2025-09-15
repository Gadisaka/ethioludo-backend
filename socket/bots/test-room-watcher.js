const { roomWatcher } = require('./roomWatcher');
const { getBotConfig } = require('./config');
const GameRoom = require('../../model/GameRoom');

// Mock GameRoom for testing
jest.mock('../../model/GameRoom');

async function testRoomWatcher() {
  console.log('🧪 Testing Room Watcher with Real Room Creation Scenario');
  console.log('=====================================================\n');

  const BOT_CONFIG = getBotConfig();
  console.log(`📋 Bot Configuration:`);
  console.log(`   - Join Delay: ${BOT_CONFIG.JOIN_DELAY_MS}ms (${BOT_CONFIG.JOIN_DELAY_MS / 1000}s)`);
  console.log(`   - Max Bots Per Game: ${BOT_CONFIG.MAX_BOTS_PER_GAME}`);
  console.log(`   - Sweep Interval: 5000ms (5s)\n`);

  // Start the room watcher
  console.log('🚀 Starting Room Watcher...');
  roomWatcher.start();
  
  // Wait a moment for initial sweep
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ Room Watcher started successfully');
  console.log(`📊 Status: ${JSON.stringify(roomWatcher.getStatus(), null, 2)}\n`);

  // Create a test room
  console.log('🏠 Creating test room...');
  const testRoom = {
    _id: 'test-room-1',
    roomId: 'test-room-1',
    players: [{ name: 'TestPlayer' }],
    gameStatus: 'waiting',
    createdAt: new Date(Date.now() - 1000), // 1 second ago
    gameSettings: { stake: 10, requiredPieces: 2 }
  };

  // Mock GameRoom.find to return our test room
  GameRoom.find.mockResolvedValue([testRoom]);

  console.log(`📝 Test Room Created:`);
  console.log(`   - Room ID: ${testRoom.roomId}`);
  console.log(`   - Players: ${testRoom.players.length}/4`);
  console.log(`   - Status: ${testRoom.gameStatus}`);
  console.log(`   - Created: ${testRoom.createdAt.toISOString()}`);
  console.log(`   - Age: ${Math.floor((Date.now() - testRoom.createdAt.getTime()) / 1000)}s\n`);

  // Perform initial sweep (room is too new, shouldn't be eligible)
  console.log('🔍 Performing initial sweep (room too new)...');
  await roomWatcher.sweep();
  
  console.log(`📊 Pending Joins: ${roomWatcher.pendingJoins.size}`);
  console.log(`   - Room eligible: ${roomWatcher.isRoomPending(testRoom.roomId)}\n`);

  // Wait for room to become eligible (31 seconds total)
  const waitTime = (BOT_CONFIG.JOIN_DELAY_MS + 1000) / 1000; // 31 seconds
  console.log(`⏰ Waiting ${waitTime}s for room to become eligible for bot joining...`);
  
  // Update room creation time to make it eligible
  const eligibleTime = Date.now() - BOT_CONFIG.JOIN_DELAY_MS - 1000; // 31 seconds ago
  testRoom.createdAt = new Date(eligibleTime);
  
  console.log(`📝 Updated room creation time to: ${testRoom.createdAt.toISOString()}`);
  console.log(`   - New age: ${Math.floor((Date.now() - eligibleTime) / 1000)}s\n`);

  // Wait a bit more for the next sweep cycle
  await new Promise(resolve => setTimeout(resolve, 6000)); // Wait for next 5s sweep

  // Perform another sweep (room should now be eligible)
  console.log('🔍 Performing sweep after delay (room now eligible)...');
  await roomWatcher.sweep();
  
  console.log(`📊 Pending Joins: ${roomWatcher.pendingJoins.size}`);
  console.log(`   - Room eligible: ${roomWatcher.isRoomPending(testRoom.roomId)}`);
  
  if (roomWatcher.pendingJoins.has(testRoom.roomId)) {
    const pendingData = roomWatcher.pendingJoins.get(testRoom.roomId);
    console.log(`   - Pending Data:`, JSON.stringify(pendingData, null, 2));
  }

  // Get all pending joins
  const pendingJoins = roomWatcher.getPendingJoins();
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
  await roomWatcher.clearPendingRoom(testRoom.roomId);
  console.log(`   - Room still pending: ${roomWatcher.isRoomPending(testRoom.roomId)}`);

  // Stop the room watcher
  console.log('\n🛑 Stopping Room Watcher...');
  roomWatcher.stop();
  
  console.log(`📊 Final Status: ${JSON.stringify(roomWatcher.getStatus(), null, 2)}`);
  console.log('\n✅ Room Watcher Test Completed Successfully!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testRoomWatcher().catch(console.error);
}

module.exports = { testRoomWatcher };
