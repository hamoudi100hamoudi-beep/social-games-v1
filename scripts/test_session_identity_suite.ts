import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomManager } from '../server/rooms.js';
import { SessionAuthStore } from '../server/sessionAuth.js';

console.log('====================================================');
console.log('🛡️  SESSION IDENTITY & RECONNECT SECURITY TEST SUITE');
console.log('====================================================\n');

let allPassed = true;
let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passCount++;
    console.log(`✅ PASS: ${testName}`);
  } else {
    failCount++;
    console.error(`❌ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
    allPassed = false;
  }
}

// -----------------------------------------------------------------
// 1. SessionAuthStore Unit Tests: Constant-Time & Hash Isolation
// -----------------------------------------------------------------
console.log('--- Test Group 1: SessionAuthStore Verification ---');
const authStore = new SessionAuthStore();
const testPid1 = 'usr-alice-12345';
const validSecret1 = 'sec-alice-secret-token-abcdef123456';
const wrongSecret = 'sec-wrong-secret-token-999999999999';

// 1.1 Registration
const regSuccess = authStore.registerCredential(testPid1, validSecret1);
assert(regSuccess === true, 'Successfully registers valid credential');
assert(authStore.hasCredential(testPid1) === true, 'Store acknowledges credential existence');

// 1.2 Verification with correct secret
const verifyValid = authStore.verifyCredential(testPid1, validSecret1);
assert(verifyValid === true, 'Verifies correct secret token');

// 1.3 Verification with incorrect secret
const verifyWrong = authStore.verifyCredential(testPid1, wrongSecret);
assert(verifyWrong === false, 'Rejects incorrect secret token');

// 1.4 Verification with missing / malformed secret
const verifyEmpty = authStore.verifyCredential(testPid1, '');
assert(verifyEmpty === false, 'Rejects empty secret');
const verifyNull = authStore.verifyCredential(testPid1, null as any);
assert(verifyNull === false, 'Rejects null secret');

// 1.5 Timing safe test & Hash length
const hash1 = authStore.hashSecret(validSecret1);
assert(hash1.length === 64, 'SHA-256 hash has exactly 64 hex characters (32 bytes)');
assert(/^[0-9a-f]{64}$/.test(hash1), 'SHA-256 hash is valid lowercase hex string');

// -----------------------------------------------------------------
// 2. RoomManager Reconnection & Authentication Gate Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 2: Room Reconnection Authorization Gate ---');
const rm = new RoomManager();
const roomId = 'Test-Security-Room';

const alicePid = 'usr-alice-identity-001';
const aliceSecret = 'sec-alice-super-secure-token-12345678';
const aliceSocket1 = 'socket-alice-001';

// Register Alice credential in manager
rm.authStore.registerCredential(alicePid, aliceSecret);

// Add Alice to room
const room = rm.addPlayerToRoom(roomId, {
  id: aliceSocket1,
  name: 'Alice',
  avatar: '🐱',
  roomId: roomId,
  score: 42,
  wins: 2,
  persistentId: alicePid,
});

assert(room.players.length === 1, 'Alice added to room');
assert(room.players[0].id === aliceSocket1, 'Alice active socket matches socket-alice-001');

// 2.1 Attacker tries to hijack Alice session with wrong secret
console.log('\nSubtest 2.1: Attacker spoofing attempt with wrong secret');
const attackerSocket = 'socket-attacker-666';
const attackerReconnect = rm.reconnectPlayer(roomId, alicePid, 'Alice', attackerSocket, wrongSecret);

assert(attackerReconnect.status === 'auth_failed', 'Rejects reconnect with wrong secret as auth_failed');
assert(room.players[0].id === aliceSocket1, 'Original Alice socket was NOT modified or replaced');
assert(room.players[0].score === 42, 'Original Alice score intact (42)');

// 2.2 Attacker tries to hijack Alice session with NO secret
console.log('\nSubtest 2.2: Attacker spoofing attempt with missing secret');
const attackerReconnectNoSecret = rm.reconnectPlayer(roomId, alicePid, 'Alice', attackerSocket, undefined);
assert(attackerReconnectNoSecret.status === 'auth_failed', 'Rejects reconnect with missing secret as auth_failed');
assert(room.players[0].id === aliceSocket1, 'Alice socket still protected');

// 2.3 Legitimate Alice reconnects with correct secret (e.g. refreshed page)
console.log('\nSubtest 2.3: Legitimate Alice reconnects with valid secret');
const aliceSocket2 = 'socket-alice-002';
const aliceReconnect = rm.reconnectPlayer(roomId, alicePid, 'Alice', aliceSocket2, aliceSecret);

assert(aliceReconnect.status === 'reconnected', 'Alice reconnection succeeded with valid secret');
assert(room.players[0].id === aliceSocket2, 'Alice socket cleanly updated to socket-alice-002');
assert(room.players[0].score === 42, 'Alice score preserved across reconnection');
assert(rm.getPlayer(aliceSocket2)?.name === 'Alice', 'Player lookup by new socket ID succeeds');

// -----------------------------------------------------------------
// 3. New Join Gate: Claiming Active Player ID with Different Nickname
// -----------------------------------------------------------------
console.log('\n--- Test Group 3: Anti-Hijacking on New Join ---');
// Attacker tries to join with Alice's persistentId
const existingActive = rm.getPlayerByPersistentId(alicePid);
assert(existingActive !== null, 'Manager recognizes Alice persistentId as active');
assert(rm.verifyPlayerSecret(alicePid, wrongSecret) === false, 'Manager rejects verification with wrong secret');
assert(rm.verifyPlayerSecret(alicePid, aliceSecret) === true, 'Manager accepts verification with Alice secret');

// -----------------------------------------------------------------
// 4. Data Leakage & Object Hygiene Audit
// -----------------------------------------------------------------
console.log('\n--- Test Group 4: Data Leakage Verification ---');
const serializedRoomPlayers = JSON.stringify(room.players);
assert(!serializedRoomPlayers.includes('sec-alice'), 'Raw reconnect secret does NOT leak into room.players');
assert(!serializedRoomPlayers.includes('secretHash'), 'Secret hash does NOT leak into room.players');
assert(!serializedRoomPlayers.includes('authStore'), 'authStore does NOT leak into room.players');

const serializedPlayer = JSON.stringify(room.players[0]);
assert(!serializedPlayer.includes('secret'), 'Individual Player object contains zero secret fields');
assert(!serializedPlayer.includes('Hash'), 'Individual Player object contains zero hash fields');

// -----------------------------------------------------------------
// 5. Silent Grace Period (90s) & Eviction Pruning Lifecycle
// -----------------------------------------------------------------
console.log('\n--- Test Group 5: 90s Grace Period and Cleanup ---');
// Disconnect Alice -> enters grace period
rm.handleDisconnect(aliceSocket2);
const disconnectedAlice = room.players.find(p => p.persistentId === alicePid);
assert(disconnectedAlice !== undefined, 'Alice remains in room during silent grace period');
assert(disconnectedAlice?.offlineSince !== undefined, 'offlineSince timestamp recorded');
assert(rm.authStore.hasCredential(alicePid) === true, 'Alice credential preserved during grace period');

// Reconnect Alice during grace period
const aliceSocket3 = 'socket-alice-003';
const graceReconnect = rm.reconnectPlayer(roomId, alicePid, 'Alice', aliceSocket3, aliceSecret);
assert(graceReconnect.status === 'reconnected', 'Alice successfully rescued from grace period');
assert(disconnectedAlice?.offlineSince === undefined, 'offlineSince cleared on reconnection');

// 5.2 Pruning test: Inactive old credentials vs Active players
const stalePid = 'usr-stale-abandoned-999';
const staleSecret = 'sec-stale-abandoned-token-9999999999';
rm.authStore.registerCredential(stalePid, staleSecret);

// Artificially age the stale record
const staleRec = (rm.authStore as any).credentials.get(stalePid);
if (staleRec) {
  staleRec.lastUsedAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours old
}

// Prune inactive entries
rm.authStore.prune((pid) => rm.isPlayerInAnyRoom(pid));

assert(rm.authStore.hasCredential(stalePid) === false, 'Stale abandoned credential older than 24h was pruned');
assert(rm.authStore.hasCredential(alicePid) === true, 'Active Alice credential was NOT pruned');

// -----------------------------------------------------------------
// 6. SESSION-IDENTITY-SEC-2: Anti-Overwrite & Idle Identity Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 6: SEC-2 Anti-Overwrite & Idle Identity Gate ---');
const sec2Store = new SessionAuthStore();
const sec2Manager = new RoomManager();
sec2Manager.authStore = sec2Store;

const bobPid = 'usr-bob-legit-777';
const bobSecretOriginal = 'sec-bob-original-secret-token-111111';
const bobSecretAttacker = 'sec-attacker-new-secret-token-222222';

// 6.1 Registration of new credential succeeds
const bobRegResult = sec2Store.registerCredential(bobPid, bobSecretOriginal);
assert(bobRegResult === true, 'SEC-2.1: Initial credential registration succeeds');

// 6.2 Attempting to overwrite existing persistentId with different secret FAILS
const overwriteAttempt = sec2Store.registerCredential(bobPid, bobSecretAttacker);
assert(overwriteAttempt === false, 'SEC-2.2: Overwriting existing persistentId fails (returns false)');
assert(sec2Store.verifyCredential(bobPid, bobSecretOriginal) === true, 'SEC-2.2: Original secret remains valid');
assert(sec2Store.verifyCredential(bobPid, bobSecretAttacker) === false, 'SEC-2.2: Attacker secret is rejected');

// 6.3 Attempt to use registered ID with wrong secret when player is NOT in any room (Idle in authStore)
assert(sec2Manager.isPlayerInAnyRoom(bobPid) === false, 'SEC-2.3: Bob is verified as NOT in any active room');

// Call RoomManager.authenticateNewJoin directly (the exact function called by server.ts):
const idleWrongAttempt = sec2Manager.authenticateNewJoin(bobPid, bobSecretAttacker, 'socket-attacker-001');
assert(idleWrongAttempt.ok === false, 'SEC-2.3: Idle persistentId with wrong secret is rejected');
assert((idleWrongAttempt as any).reason === 'invalid_credentials', 'SEC-2.3: Rejection reason is invalid_credentials');

// 6.4 Attempt to use registered ID with NO secret when player is NOT in any room
const idleNoSecretAttempt = sec2Manager.authenticateNewJoin(bobPid, undefined, 'socket-attacker-002');
assert(idleNoSecretAttempt.ok === false, 'SEC-2.4: Idle persistentId with missing secret is rejected');
assert((idleNoSecretAttempt as any).reason === 'invalid_credentials', 'SEC-2.4: Missing secret gives invalid_credentials');
assert(sec2Store.verifyCredential(bobPid, bobSecretOriginal) === true, 'SEC-2.4: Credential remained untouched and unmodified');

// 6.4b Attempt to use UNREGISTERED ID with missing secret is rejected before player creation
const unregNoSecretAttempt = sec2Manager.authenticateNewJoin('usr-unreg-david', undefined, 'socket-unreg-001');
assert(unregNoSecretAttempt.ok === false, 'SEC-2.4b: Unregistered persistentId with missing secret is rejected');
assert((unregNoSecretAttempt as any).reason === 'missing_or_invalid_secret', 'SEC-2.4b: Reason indicates missing_or_invalid_secret');
assert(sec2Store.hasCredential('usr-unreg-david') === false, 'SEC-2.4b: No credential was created for unauthenticated join');

// 6.5 Legitimate user with correct secret joins room successfully without altering credential
const idleValidAttempt = sec2Manager.authenticateNewJoin(bobPid, bobSecretOriginal, 'socket-bob-001');
assert(idleValidAttempt.ok === true, 'SEC-2.5: Idle persistentId with correct secret is allowed');

const bobRoom = sec2Manager.addPlayerToRoom('Sec2-Room', {
  id: 'socket-bob-001',
  name: 'Bob',
  avatar: '🤠',
  roomId: 'Sec2-Room',
  score: 100,
  wins: 5,
  persistentId: bobPid
});
assert(bobRoom.players.length === 1, 'SEC-2.5: Bob player successfully created in room');

// 6.6 Auth failure does NOT alter original player state, socket, or eviction timers
const bobRoomBefore = { ...bobRoom.players[0] };
const hijackAttempt = sec2Manager.reconnectPlayer('Sec2-Room', bobPid, 'Bob', 'socket-malicious-999', 'wrong-pass-123');
assert(hijackAttempt.status === 'auth_failed', 'SEC-2.6: Reconnection hijack attempt returns auth_failed');
assert(bobRoom.players[0].id === 'socket-bob-001', 'SEC-2.6: Original player socket is untouched');
assert(bobRoom.players[0].score === bobRoomBefore.score, 'SEC-2.6: Original player score is untouched (100)');
assert(bobRoom.players[0].isOffline === bobRoomBefore.isOffline, 'SEC-2.6: Original player online state is untouched');

// 6.7 Failed registration prevents join completion
const invalidFormatAttempt = sec2Manager.authenticateNewJoin('usr-new-charlie', 'too-short', 'socket-charlie-001');
assert(invalidFormatAttempt.ok === false, 'SEC-2.7: Registration with invalid secret format is blocked');
assert((invalidFormatAttempt as any).reason === 'missing_or_invalid_secret', 'SEC-2.7: Reason indicates missing_or_invalid_secret');
assert(sec2Store.hasCredential('usr-new-charlie') === false, 'SEC-2.7: No credential was created for failed registration');

// 6.8 Missing or empty playerId is strictly rejected (Point 2)
const missingPidAttempt = sec2Manager.validateJoinIdentity('', 'sec-valid-secret-12345678', 'socket-001');
assert(missingPidAttempt.ok === false, 'SEC-2.8: Missing playerId is rejected by validateJoinIdentity');
assert((missingPidAttempt as any).reason === 'missing_player_id', 'SEC-2.8: Reason indicates missing_player_id');

// 6.9 Room ID validity check
assert(sec2Manager.isValidRoomId('General #Test') === true, 'SEC-2.9: Preset room is recognized as valid');
assert(sec2Manager.isValidRoomId('Ghost-Room-Does-Not-Exist') === false, 'SEC-2.9: Non-existent custom room is rejected');

// -----------------------------------------------------------------
// 7. Real Socket.IO Network Integration Tests (Port 0 Ephemeral Server)
// -----------------------------------------------------------------
console.log('\n--- Test Group 7: Real Socket.IO Network Integration Tests ---');
const netHttpServer = createServer();
const netIo = new Server(netHttpServer);
const netRm = new RoomManager();
netRm.setIo(netIo);

netIo.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, nickname, avatar, playerId, reconnectOnly, reconnectSecret }, callback) => {
    try {
      if (!netRm.isValidRoomId(roomId)) {
        if (callback) callback({ error: 'room_not_found', success: false });
        return;
      }

      if (!playerId || typeof playerId !== 'string' || playerId.trim().length === 0) {
        if (callback) callback({ error: 'unauthorized', success: false, reason: 'missing_player_id' });
        return;
      }

      const reconnectRes = netRm.reconnectPlayer(roomId, playerId, nickname, socket.id, reconnectSecret);
      if (reconnectRes.status === 'auth_failed') {
        if (callback) callback({ error: 'unauthorized', success: false, reason: reconnectRes.reason });
        return;
      }
      if (reconnectRes.status === 'reconnected') {
        if (callback) callback({ success: true, reconnected: true });
        return;
      }
      if (reconnectOnly) {
        if (callback) callback({ error: 'session_expired', reason: 'connection_lost' });
        return;
      }

      // Production-identical join gate invocation (Phase 1: Validation without registration)
      const authJoinRes = netRm.validateJoinIdentity(playerId, reconnectSecret, socket.id);
      if (!authJoinRes.ok) {
        if (callback) callback({ error: 'unauthorized', success: false, reason: authJoinRes.reason });
        return;
      }

      // Check room conditions (nickname & capacity)
      const existingRoom = netRm.getRoom(roomId);
      if (existingRoom) {
        const isNicknameTaken = existingRoom.players.some((p) => p.name === nickname);
        if (isNicknameTaken) {
          if (callback) callback({ error: 'nickname_taken', success: false });
          return;
        }
        const maxCapacity = existingRoom.maxPlayers || 5;
        const onlineCount = existingRoom.players.filter((p) => !p.isOffline).length;
        if (onlineCount >= maxCapacity) {
          if (callback) callback({ error: 'عذراً، هذه الغرفة ممتلئة بالكامل!' });
          return;
        }
      }

      // Phase 2: Commit credential ONLY after room conditions pass!
      if (authJoinRes.isNew) {
        const regOk = netRm.commitNewJoinCredential(authJoinRes.cleanPid, reconnectSecret!);
        if (!regOk) {
          if (callback) callback({ error: 'unauthorized', success: false, reason: 'registration_failed' });
          return;
        }
      }

      netRm.addPlayerToRoom(roomId, {
        id: socket.id,
        name: nickname,
        avatar: avatar || '🐱',
        roomId: roomId,
        score: 0,
        wins: 0,
        persistentId: authJoinRes.cleanPid
      });
      if (callback) callback({ success: true, reconnected: false });
    } catch (e: any) {
      if (callback) callback({ error: e.message });
    }
  });
});

await new Promise<void>((resolve) => netHttpServer.listen(0, '127.0.0.1', resolve));
const netPort = (netHttpServer.address() as any).port;
const serverUrl = `http://127.0.0.1:${netPort}`;

const connectClient = async () => {
  const client = ioClient(serverUrl, { transports: ['websocket'], forceNew: true });
  await new Promise<void>((resolve) => client.on('connect', resolve));
  return client;
};

// 7.1 Register new identity with valid secret over real socket network
const client1 = await connectClient();
const netDavePid = 'usr-net-dave-001';
const netDaveSecret = 'sec-net-dave-secret-token-12345678';

const joinRes1: any = await new Promise((res) => {
  client1.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'DaveNet',
    playerId: netDavePid,
    reconnectSecret: netDaveSecret
  }, res);
});
assert(joinRes1.success === true && joinRes1.reconnected === false, 'NET-7.1: Register new identity with valid secret over Socket.IO succeeds');
assert(netRm.authStore.hasCredential(netDavePid) === true, 'NET-7.1: Credential was successfully registered in authStore');

// 7.2 Reject spoofing registered identity when owner is idle / not in any room
const netEvePid = 'usr-net-eve-002';
const netEveSecret = 'sec-net-eve-secret-token-87654321';
netRm.authStore.registerCredential(netEvePid, netEveSecret); // Eve registered, but not in any room
assert(netRm.isPlayerInAnyRoom(netEvePid) === false, 'NET-7.2: Eve is verified as NOT in any active room');

const clientAttacker = await connectClient();
const spoofRes: any = await new Promise((res) => {
  clientAttacker.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'EveFake',
    playerId: netEvePid,
    reconnectSecret: 'sec-attacker-wrong-secret-token-999'
  }, res);
});
assert(spoofRes.error === 'unauthorized', 'NET-7.2: Attacker spoofing idle persistentId is rejected over network');
assert(spoofRes.reason === 'invalid_credentials', 'NET-7.2: Reason is invalid_credentials');
assert(netRm.isPlayerInAnyRoom(netEvePid) === false, 'NET-7.2: No player was created for spoof attempt');

// 7.3 Reject registered identity when secret is missing or empty over network
const missingSecretRes: any = await new Promise((res) => {
  clientAttacker.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'EveFake2',
    playerId: netEvePid,
    reconnectSecret: ''
  }, res);
});
assert(missingSecretRes.error === 'unauthorized', 'NET-7.3: Missing secret for registered ID is rejected over network');
assert(missingSecretRes.reason === 'invalid_credentials', 'NET-7.3: Reason is invalid_credentials');

// 7.4 Reject new identity when secret is missing
const unregMissingRes: any = await new Promise((res) => {
  clientAttacker.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'Frank',
    playerId: 'usr-net-frank-003',
    reconnectSecret: undefined
  }, res);
});
assert(unregMissingRes.error === 'unauthorized', 'NET-7.4: Unregistered ID with missing secret is rejected over network');
assert(unregMissingRes.reason === 'missing_or_invalid_secret', 'NET-7.4: Reason is missing_or_invalid_secret');
assert(netRm.authStore.hasCredential('usr-net-frank-003') === false, 'NET-7.4: No credential registered for unauthenticated join');
assert(netRm.isPlayerInAnyRoom('usr-net-frank-003') === false, 'NET-7.4: No player created for unauthenticated join');

// 7.5 Accept rightful owner with correct secret without altering registered credential
const clientEveLegit = await connectClient();
const eveJoinRes: any = await new Promise((res) => {
  clientEveLegit.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'EveReal',
    playerId: netEvePid,
    reconnectSecret: netEveSecret
  }, res);
});
assert(eveJoinRes.success === true, 'NET-7.5: Rightful owner joins room with valid secret over network');
assert(netRm.verifyPlayerSecret(netEvePid, netEveSecret) === true, 'NET-7.5: Credential remained valid and unaltered');
const eveInRoom = netRm.getPlayerByPersistentId(netEvePid);
assert(eveInRoom !== null, 'NET-7.5: Eve is now present in room');

// 7.6 Original socket and player score/state are NOT modified when spoofing/reconnect hijack fails
if (eveInRoom) {
  eveInRoom.player.score = 75; // Set score
}
const eveSocketIdBefore = eveInRoom?.player.id;

const hijackNetRes: any = await new Promise((res) => {
  clientAttacker.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'EveReal',
    playerId: netEvePid,
    reconnectSecret: 'sec-wrong-hijack-attempt-99999'
  }, res);
});
assert(hijackNetRes.error === 'unauthorized', 'NET-7.6: Reconnect hijack rejected over network');
const eveInRoomAfter = netRm.getPlayerByPersistentId(netEvePid);
assert(eveInRoomAfter?.player.id === eveSocketIdBefore, 'NET-7.6: Original Eve socket ID was NOT modified');
assert(eveInRoomAfter?.player.score === 75, 'NET-7.6: Original Eve player score remains 75');

// 7.7 Point 1 Test: Join request to NON-EXISTENT room with new playerId and valid secret is rejected and does NOT register credential
const ghostJoinerPid = 'usr-ghost-room-joiner-007';
const ghostJoinerSecret = 'sec-ghost-joiner-secret-12345678';
const ghostJoinRes: any = await new Promise((res) => {
  client1.emit('join_room', {
    roomId: 'Non-Existent-Ghost-Room-XYZ',
    nickname: 'GhostSeeker',
    playerId: ghostJoinerPid,
    reconnectSecret: ghostJoinerSecret
  }, res);
});
assert(ghostJoinRes.error === 'room_not_found', 'NET-7.7: Join to non-existent room is rejected with room_not_found');
assert(netRm.authStore.hasCredential(ghostJoinerPid) === false, 'NET-7.7: Credential was NOT registered for rejected room join');

// 7.8 Point 1 Test: Join request to FULL room with new playerId and valid secret is rejected and does NOT register credential
const testFullRoom = netRm.getRoom('General #Test');
if (testFullRoom) {
  testFullRoom.maxPlayers = 2; // Dave and Eve are already 2 players in General #Test
}
const fullJoinerPid = 'usr-full-room-joiner-008';
const fullJoinerSecret = 'sec-full-joiner-secret-12345678';
const fullJoinRes: any = await new Promise((res) => {
  client1.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'FullSeeker',
    playerId: fullJoinerPid,
    reconnectSecret: fullJoinerSecret
  }, res);
});
assert(fullJoinRes.error === 'عذراً، هذه الغرفة ممتلئة بالكامل!', 'NET-7.8: Join to full room is rejected with room full message');
assert(netRm.authStore.hasCredential(fullJoinerPid) === false, 'NET-7.8: Credential was NOT registered when join rejected due to full room');

// 7.9 Point 2 Test: Join request with MISSING playerId is rejected before player creation
const missingPidRes: any = await new Promise((res) => {
  clientAttacker.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'NoIdPlayer',
    playerId: '',
    reconnectSecret: 'sec-some-secret-12345678'
  }, res);
});
assert(missingPidRes.error === 'unauthorized', 'NET-7.9: Join with empty playerId is rejected as unauthorized');
assert(missingPidRes.reason === 'missing_player_id', 'NET-7.9: Reason is missing_player_id');

// Teardown network sockets & server
client1.disconnect();
clientAttacker.disconnect();
clientEveLegit.disconnect();
await new Promise<void>((resolve) => netIo.close(() => resolve()));
await new Promise<void>((resolve) => netHttpServer.close(() => resolve()));

// -----------------------------------------------------------------
// Summary
// -----------------------------------------------------------------
console.log('\n====================================================');
if (allPassed) {
  console.log(`🎉 ALL ${passCount} SESSION IDENTITY SECURITY TESTS PASSED!`);
  console.log('====================================================');
  process.exit(0);
} else {
  console.error(`❌ ${failCount} TESTS FAILED (Passed: ${passCount})`);
  console.log('====================================================');
  process.exit(1);
}
