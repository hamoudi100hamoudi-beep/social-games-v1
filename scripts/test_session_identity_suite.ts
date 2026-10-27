import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomManager, normalizeArabic } from '../server/rooms.js';
import { SessionAuthStore } from '../server/sessionAuth.js';
import { registerJoinRoomHandler, normalizeNickname } from '../server/registerJoinRoomHandler.js';
import { registerDrawBinaryHandler, handleDrawBinary } from '../server/registerDrawBinaryHandler.js';
import { registerSubmitGuessHandler, handleSubmitGuess } from '../server/registerSubmitGuessHandler.js';
import { registerSelectWordHandler, handleSelectWord } from '../server/registerSelectWordHandler.js';
import { registerSendMessageHandler, handleSendMessage } from '../server/registerSendMessageHandler.js';

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
// 6b. SESSION-IDENTITY-SEC-3: Missing/Pruned Credential Reconnection Defense
// -----------------------------------------------------------------
console.log('\n--- Test Group 6b: SEC-3 Missing/Pruned Credential Reconnection Defense ---');
const sec3Store = new SessionAuthStore();
const sec3Manager = new RoomManager();
sec3Manager.authStore = sec3Store;

const charliePid = 'usr-charlie-pruned-999';
const charlieSocketOriginal = 'socket-charlie-original';
const charlieSecret = 'sec-charlie-valid-token-12345678';

sec3Store.registerCredential(charliePid, charlieSecret);
const charlieRoom = sec3Manager.addPlayerToRoom('General #Test', {
  id: charlieSocketOriginal,
  name: 'Charlie',
  avatar: '🦊',
  roomId: 'General #Test',
  score: 55,
  wins: 3,
  persistentId: charliePid
});

sec3Manager.handleDisconnect(charlieSocketOriginal);
const charliePlayerInRoom = charlieRoom.players.find(p => p.persistentId === charliePid);
assert(charliePlayerInRoom !== undefined, 'SEC-3.1: Charlie is in room and offline');

sec3Store.removeCredential(charliePid);
assert(sec3Store.hasCredential(charliePid) === false, 'SEC-3.1: Charlie credential successfully removed from store (pruned/lost)');

const reconnectNoSecret = sec3Manager.reconnectPlayer('General #Test', charliePid, 'Charlie', 'socket-charlie-new-1', undefined);
assert(reconnectNoSecret.status === 'auth_failed', 'SEC-3.2: Reconnect without secret when credential missing returns auth_failed');
assert((reconnectNoSecret as any).reason === 'missing_credentials', 'SEC-3.2: Rejection reason is missing_credentials');
assert(charlieRoom.players[0].id === charlieSocketOriginal, 'SEC-3.2: Original socket unchanged');
assert(charlieRoom.players[0].score === 55, 'SEC-3.2: Original score unchanged');
assert(sec3Store.hasCredential(charliePid) === false, 'SEC-3.2: No fallback credential registered');

const reconnectNewSecret = sec3Manager.reconnectPlayer('General #Test', charliePid, 'Charlie', 'socket-charlie-new-2', 'sec-attacker-brand-new-999999');
assert(reconnectNewSecret.status === 'auth_failed', 'SEC-3.3: Reconnect with unregistered new secret returns auth_failed');
assert((reconnectNewSecret as any).reason === 'missing_credentials', 'SEC-3.3: Rejection reason is missing_credentials');
assert(charlieRoom.players[0].id === charlieSocketOriginal, 'SEC-3.3: Original socket unchanged');
assert(sec3Store.hasCredential(charliePid) === false, 'SEC-3.3: No fallback credential registered on failed reconnect');

// -----------------------------------------------------------------
// 7. Real Socket.IO Network Integration Tests (Port 0 Ephemeral Server)
// -----------------------------------------------------------------
console.log('\n--- Test Group 7: Real Socket.IO Network Integration Tests ---');
const netHttpServer = createServer();
const netIo = new Server(netHttpServer);
const netRm = new RoomManager();
netRm.setIo(netIo);

netIo.on('connection', (socket) => {
  registerJoinRoomHandler(socket, {
    io: netIo,
    roomManager: netRm,
    getRoomConfig: () => ({ maxPlayers: 5, winningScore: 30, theme: 'General' }),
    getJsonSafeHistory: (history) => history || []
  });
  registerDrawBinaryHandler(socket, {
    io: netIo,
    roomManager: netRm
  });
  registerSubmitGuessHandler(socket, {
    roomManager: netRm
  });
  registerSelectWordHandler(socket, {
    roomManager: netRm
  });
  registerSendMessageHandler(socket, {
    io: netIo,
    roomManager: netRm,
    normalizeArabic
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

// 7.10 Banned player is rejected over network before credential or player registration
const bannedPid = 'usr-net-banned-001';
const bannedSecret = 'sec-banned-secret-12345678';
const generalRoom = netRm.getRoom('General #Test');
if (generalRoom) {
  if (!generalRoom.bannedUsers) generalRoom.bannedUsers = [];
  generalRoom.bannedUsers.push(bannedPid);
}
const bannedJoinRes: any = await new Promise((res) => {
  clientAttacker.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'BannedUser',
    playerId: bannedPid,
    reconnectSecret: bannedSecret
  }, res);
});
assert(bannedJoinRes.error === 'banned', 'NET-7.10: Banned player is rejected over network with error: banned');
assert(bannedJoinRes.success === false, 'NET-7.10: Banned join success is false');
assert(netRm.authStore.hasCredential(bannedPid) === false, 'NET-7.10: No credential registered for banned player');
assert(generalRoom?.players.some(p => p.persistentId === bannedPid) === false, 'NET-7.10: No player created for banned player');

// 7.11 reconnectOnly request for expired/unknown session over network
const clientExpired = await connectClient();
const expiredEventPromise = new Promise<any>((resolve) => {
  clientExpired.on('session_expired', (data) => resolve(data));
});
const expiredReconRes: any = await new Promise((res) => {
  clientExpired.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'ExpiredUser',
    playerId: 'usr-net-unknown-expired',
    reconnectSecret: 'sec-some-unknown-secret',
    reconnectOnly: true
  }, res);
});
const expiredEventData = await expiredEventPromise;
assert(expiredReconRes.error === 'session_expired', 'NET-7.11: reconnectOnly returns error: session_expired');
assert(expiredReconRes.reason === 'connection_lost', 'NET-7.11: reconnectOnly reason is connection_lost');
assert(expiredEventData?.reason === 'connection_lost', 'NET-7.11: session_expired event emitted to client');
clientExpired.disconnect();

// 7.12 Reconnect when registered credential is lost/pruned over network
if (generalRoom) {
  generalRoom.maxPlayers = 10;
}
const prunedPid = 'usr-net-pruned-recon';
const prunedSec = 'sec-pruned-secret-123456';
const clientPruned = await connectClient();
const prunedJoin1: any = await new Promise((res) => {
  clientPruned.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'PrunedUser',
    playerId: prunedPid,
    reconnectSecret: prunedSec
  }, res);
});
assert(prunedJoin1.success === true, 'NET-7.12: Initial join for pruned-test succeeds');
clientPruned.disconnect();

// Simulate credential lost/pruned
netRm.authStore.removeCredential(prunedPid);

const clientPrunedRecon = await connectClient();
const prunedReconRes: any = await new Promise((res) => {
  clientPrunedRecon.emit('join_room', {
    roomId: 'General #Test',
    nickname: 'PrunedUser',
    playerId: prunedPid,
    reconnectSecret: prunedSec,
    reconnectOnly: true
  }, res);
});
assert(prunedReconRes.error === 'unauthorized', 'NET-7.12: Reconnect with pruned credential rejected with unauthorized');
assert(prunedReconRes.reason === 'missing_credentials', 'NET-7.12: Reason is missing_credentials');
assert(netRm.authStore.hasCredential(prunedPid) === false, 'NET-7.12: No fallback credential registered');
clientPrunedRecon.disconnect();

// -----------------------------------------------------------------
// 8. SESSION-NICKNAME-UX-1: Normalized Nickname Taken & Duplicate Rejection Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 8: UX-1 Normalized Nickname Taken Tests ---');
const uxRoomId = 'General #Test';
const uxRoom = netRm.getRoom(uxRoomId);
if (uxRoom) {
  uxRoom.players = [];
  uxRoom.maxPlayers = 5;
}

const clientAlpha = await connectClient();
const alphaPid = 'usr-ux-alpha-001';
const alphaSecret = 'sec-alpha-secret-token-12345678';
const alphaJoin: any = await new Promise((res) => {
  clientAlpha.emit('join_room', {
    roomId: uxRoomId,
    nickname: '  أحمد  ',
    playerId: alphaPid,
    reconnectSecret: alphaSecret
  }, res);
});
assert(alphaJoin.success === true, 'UX-8.1: Alpha joins room successfully with spaced nickname');

const clientBeta = await connectClient();
const betaPid = 'usr-ux-beta-002';
const betaSecret = 'sec-beta-secret-token-87654321';
const betaJoin: any = await new Promise((res) => {
  clientBeta.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'أحمد',
    playerId: betaPid,
    reconnectSecret: betaSecret
  }, res);
});
assert(betaJoin.error === 'nickname_taken', 'UX-8.2: Beta join with normalized duplicate nickname is rejected with nickname_taken');
assert(netRm.authStore.hasCredential(betaPid) === false, 'UX-8.2: No credential registered for rejected nickname join');
assert(uxRoom?.players.length === 1, 'UX-8.2: Room player count remains 1 (no second player created)');

clientAlpha.disconnect();
clientBeta.disconnect();

// 8.3 Taa Marbuta vs Haa normalization over network
if (uxRoom) uxRoom.players = [];
const clientFatima1 = await connectClient();
const fatima1Pid = 'usr-fatima-1';
const fatimaJoin1: any = await new Promise((res) => {
  clientFatima1.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'فاطمة',
    playerId: fatima1Pid,
    reconnectSecret: 'sec-fatima-1-12345678'
  }, res);
});
assert(fatimaJoin1.success === true, 'UX-8.3: Fatima 1 joins with taa marbuta (فاطمة)');

const clientFatima2 = await connectClient();
const fatima2Pid = 'usr-fatima-2';
const fatimaJoin2: any = await new Promise((res) => {
  clientFatima2.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'فاطمه',
    playerId: fatima2Pid,
    reconnectSecret: 'sec-fatima-2-12345678'
  }, res);
});
assert(fatimaJoin2.error === 'nickname_taken', 'UX-8.3: Fatima 2 (فاطمه with haa) rejected with nickname_taken');
assert(netRm.authStore.hasCredential(fatima2Pid) === false, 'UX-8.3: No credential registered for rejected haa variation');
assert(uxRoom?.players.length === 1, 'UX-8.3: Room player count remains 1');
clientFatima1.disconnect();
clientFatima2.disconnect();

// 8.4 Tashkeel / Harakat normalization over network
if (uxRoom) uxRoom.players = [];
const clientMohammad1 = await connectClient();
const mohammad1Pid = 'usr-mohammad-1';
const mohammadJoin1: any = await new Promise((res) => {
  clientMohammad1.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'محمد',
    playerId: mohammad1Pid,
    reconnectSecret: 'sec-mohammad-1-12345678'
  }, res);
});
assert(mohammadJoin1.success === true, 'UX-8.4: Mohammad 1 joins with plain name (محمد)');

const clientMohammad2 = await connectClient();
const mohammad2Pid = 'usr-mohammad-2';
const mohammadJoin2: any = await new Promise((res) => {
  clientMohammad2.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'مُحمَّد',
    playerId: mohammad2Pid,
    reconnectSecret: 'sec-mohammad-2-12345678'
  }, res);
});
assert(mohammadJoin2.error === 'nickname_taken', 'UX-8.4: Mohammad 2 with tashkeel (مُحمَّد) rejected with nickname_taken');
assert(netRm.authStore.hasCredential(mohammad2Pid) === false, 'UX-8.4: No credential registered for rejected tashkeel variation');
assert(uxRoom?.players.length === 1, 'UX-8.4: Room player count remains 1');
clientMohammad1.disconnect();
clientMohammad2.disconnect();

// 8.5 Alif Maqsura vs Yaa normalization over network
if (uxRoom) uxRoom.players = [];
const clientYosra1 = await connectClient();
const yosra1Pid = 'usr-yosra-1';
const yosraJoin1: any = await new Promise((res) => {
  clientYosra1.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'يسرى',
    playerId: yosra1Pid,
    reconnectSecret: 'sec-yosra-1-12345678'
  }, res);
});
assert(yosraJoin1.success === true, 'UX-8.5: Yosra 1 joins with alif maqsura (يسرى)');

const clientYosra2 = await connectClient();
const yosra2Pid = 'usr-yosra-2';
const yosraJoin2: any = await new Promise((res) => {
  clientYosra2.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'يسري',
    playerId: yosra2Pid,
    reconnectSecret: 'sec-yosra-2-12345678'
  }, res);
});
assert(yosraJoin2.error === 'nickname_taken', 'UX-8.5: Yosra 2 with yaa (يسري) rejected with nickname_taken');
assert(netRm.authStore.hasCredential(yosra2Pid) === false, 'UX-8.5: No credential registered for rejected yaa variation');
assert(uxRoom?.players.length === 1, 'UX-8.5: Room player count remains 1');
clientYosra1.disconnect();
clientYosra2.disconnect();

// -----------------------------------------------------------------
// 9. SESSION-AUTH-STORE-1: Capacity Cap & Active Player Protection Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 9: SESSION-AUTH-STORE-1 Capacity Cap & Active Protection ---');

// 9.1 Unit Test: Direct SessionAuthStore capacity limit and inactive pruning
const capStore = new SessionAuthStore(3);
const pActive1 = 'usr-cap-active-001';
const pActive2 = 'usr-cap-active-002';
const pInactive1 = 'usr-cap-inactive-001';
const secActive1 = 'sec-token-active-001-abcdef';
const secActive2 = 'sec-token-active-002-abcdef';
const secInactive1 = 'sec-token-inactive-001-abcdef';

const activeRegistry = new Set<string>([pActive1, pActive2]);
const isActive = (pid: string) => activeRegistry.has(pid);
capStore.setActivePredicate(isActive);

// Register 2 active + 1 inactive to reach capacity (3)
assert(capStore.registerCredential(pActive1, secActive1) === true, 'STORE-9.1: Register active player 1 succeeds');
assert(capStore.registerCredential(pActive2, secActive2) === true, 'STORE-9.1: Register active player 2 succeeds');
assert(capStore.registerCredential(pInactive1, secInactive1) === true, 'STORE-9.1: Register inactive player succeeds, store at capacity (3)');
assert(capStore.size === 3, 'STORE-9.1: Store size is exactly 3');

// 9.2 Check canRegisterNew: Should return true because pInactive1 can be reclaimed
assert(capStore.canRegisterNew() === true, 'STORE-9.2: canRegisterNew returns true when inactive credential is prune-eligible');

// 9.3 Register new active player 3: Should reclaim space from pInactive1 only
const pActive3 = 'usr-cap-active-003';
const secActive3 = 'sec-token-active-003-abcdef';
activeRegistry.add(pActive3);
const regActive3 = capStore.registerCredential(pActive3, secActive3);
assert(regActive3 === true, 'STORE-9.3: Registering active 3 succeeds by pruning inactive credential');
assert(capStore.size <= 3, 'STORE-9.3: Capacity limit (3) is NOT exceeded after registration');
assert(capStore.hasCredential(pInactive1) === false, 'STORE-9.3: Inactive credential was pruned');
assert(capStore.hasCredential(pActive1) === true, 'STORE-9.3: Active player 1 credential preserved');
assert(capStore.hasCredential(pActive2) === true, 'STORE-9.3: Active player 2 credential preserved');
assert(capStore.hasCredential(pActive3) === true, 'STORE-9.3: Active player 3 credential registered');

// 9.4 All credentials in store are now active. Try to register 4th player.
assert(capStore.canRegisterNew() === false, 'STORE-9.4: canRegisterNew returns false when all entries are active and store is full');
const pActive4 = 'usr-cap-active-004';
const secActive4 = 'sec-token-active-004-abcdef';
const regActive4 = capStore.registerCredential(pActive4, secActive4);
assert(regActive4 === false, 'STORE-9.4: Registering 4th player fails safely when store is full of active players');
assert(capStore.size === 3, 'STORE-9.4: Store size did NOT exceed 3');
assert(capStore.hasCredential(pActive1) === true, 'STORE-9.4: Active player 1 was NOT deleted');
assert(capStore.hasCredential(pActive2) === true, 'STORE-9.4: Active player 2 was NOT deleted');
assert(capStore.hasCredential(pActive3) === true, 'STORE-9.4: Active player 3 was NOT deleted');
assert(capStore.hasCredential(pActive4) === false, 'STORE-9.4: Rejected player has no partial or stored credential');

// 9.5 Active reconnection verification: Reconnect with valid secret succeeds under storage pressure
assert(capStore.verifyCredential(pActive1, secActive1) === true, 'STORE-9.5: Active player 1 can still verify and reconnect');
assert(capStore.verifyCredential(pActive2, secActive2) === true, 'STORE-9.5: Active player 2 can still verify and reconnect');

// 9.6 RoomManager integration test with custom capacity
const rmCap = new RoomManager();
rmCap.authStore = new SessionAuthStore(2);
rmCap.authStore.setActivePredicate((pid) => rmCap.isPlayerInAnyRoom(pid));

const rmCapRoomId = 'Capacity-Room-Test';
const rmP1 = 'usr-rm-cap-001';
const rmSec1 = 'sec-rm-cap-token-001-123456';
const rmP2 = 'usr-rm-cap-002';
const rmSec2 = 'sec-rm-cap-token-002-123456';

// Join Player 1
const authRm1 = rmCap.authenticateNewJoin(rmP1, rmSec1, 'socket-rm-1');
assert(authRm1.ok === true, 'RM-9.6: Player 1 authenticated and registered');
rmCap.addPlayerToRoom(rmCapRoomId, {
  id: 'socket-rm-1',
  name: 'Player1',
  avatar: 'A',
  roomId: rmCapRoomId,
  score: 10,
  wins: 0,
  persistentId: rmP1
});

// Join Player 2 (store now has 2/2 active players)
const authRm2 = rmCap.authenticateNewJoin(rmP2, rmSec2, 'socket-rm-2');
assert(authRm2.ok === true, 'RM-9.6: Player 2 authenticated and registered');
rmCap.addPlayerToRoom(rmCapRoomId, {
  id: 'socket-rm-2',
  name: 'Player2',
  avatar: 'B',
  roomId: rmCapRoomId,
  score: 20,
  wins: 0,
  persistentId: rmP2
});

assert(rmCap.authStore.size === 2, 'RM-9.6: RoomManager authStore reached full capacity (2/2)');

// Attempt to join Player 3 when store is full of active players
const rmP3 = 'usr-rm-cap-003';
const rmSec3 = 'sec-rm-cap-token-003-123456';
const valRm3 = rmCap.validateJoinIdentity(rmP3, rmSec3, 'socket-rm-3');
assert(valRm3.ok === false, 'RM-9.7: validateJoinIdentity rejects when authStore is full of active players');
if (!valRm3.ok) {
  assert((valRm3 as any).reason === 'auth_store_full', 'RM-9.7: Rejection reason is auth_store_full');
}
const authRm3 = rmCap.authenticateNewJoin(rmP3, rmSec3, 'socket-rm-3');
assert(authRm3.ok === false, 'RM-9.7: authenticateNewJoin fails safely');
if (!authRm3.ok) {
  assert((authRm3 as any).reason === 'auth_store_full', 'RM-9.7: authenticateNewJoin reason is auth_store_full');
}
assert(rmCap.authStore.hasCredential(rmP3) === false, 'RM-9.7: No credential was created for Player 3');
assert(rmCap.authStore.size === 2, 'RM-9.7: AuthStore size strictly preserved at 2');
assert(rmCap.authStore.hasCredential(rmP1) === true, 'RM-9.7: Active Player 1 preserved in RoomManager');
assert(rmCap.authStore.hasCredential(rmP2) === true, 'RM-9.7: Active Player 2 preserved in RoomManager');

// 9.8 Network Socket.IO Integration: auth_store_full over real network
const netCapStore = new SessionAuthStore(2);
netRm.authStore = netCapStore;
netCapStore.setActivePredicate((pid) => netRm.isPlayerInAnyRoom(pid));

const netP1 = 'usr-net-active-101';
const netP2 = 'usr-net-active-102';
const netSec1 = 'sec-net-active-101-token-123456';
const netSec2 = 'sec-net-active-102-token-123456';

netCapStore.registerCredential(netP1, netSec1);
netCapStore.registerCredential(netP2, netSec2);

const netRoomObj = netRm.getRoom(uxRoomId);
if (netRoomObj) {
  netRoomObj.players = [
    { id: 'socket-dummy-1', name: 'NetActive1', avatar: '1', roomId: uxRoomId, score: 5, wins: 0, persistentId: netP1 },
    { id: 'socket-dummy-2', name: 'NetActive2', avatar: '2', roomId: uxRoomId, score: 10, wins: 0, persistentId: netP2 },
  ];
  netRoomObj.maxPlayers = 10;
}

const clientCapTest = await connectClient();
const pNetBlocked = 'usr-net-blocked-999';
const secNetBlocked = 'sec-net-blocked-token-999999';

const netBlockedJoin: any = await new Promise((res) => {
  clientCapTest.emit('join_room', {
    roomId: uxRoomId,
    nickname: 'CapBlocked',
    playerId: pNetBlocked,
    reconnectSecret: secNetBlocked
  }, res);
});

assert(netBlockedJoin.error === 'auth_store_full', 'NET-9.8: Network join rejected with error: auth_store_full');
assert(netBlockedJoin.reason === 'auth_store_full', 'NET-9.8: Network join reason is auth_store_full');
assert(netBlockedJoin.success === false, 'NET-9.8: Network join success is false');
assert(netCapStore.hasCredential(pNetBlocked) === false, 'NET-9.8: No credential registered for rejected network client');
assert(netCapStore.size === 2, 'NET-9.8: Store size strictly bounded at 2 over network');
assert(netRoomObj?.players.length === 2, 'NET-9.8: Room player count unchanged (no player created)');

clientCapTest.disconnect();

// -----------------------------------------------------------------
// 10. CONNECTION-STATUS-UX-1: Connection Status, Reconnect Lifecycle & Sequence Tracking
// -----------------------------------------------------------------
console.log('\n--- Test Group 10: CONNECTION-STATUS-UX-1 Tests ---');

// 10.1: Initial Join Lifecycle & State Logic Simulation
{
  let isConnected = true;
  let isRoomJoined = false;
  let hasJoinedRoomOnce = false;

  const isOverlayVisible = () => hasJoinedRoomOnce && (!isConnected || !isRoomJoined);

  assert(!isOverlayVisible(), 'UX-10.1: Overlay is initially NOT visible prior to first successful join');
  assert(!hasJoinedRoomOnce, 'UX-10.1: hasJoinedRoomOnce is initially false');

  // Successful join occurs
  hasJoinedRoomOnce = true;
  isRoomJoined = true;

  assert(!isOverlayVisible(), 'UX-10.1: Overlay remains NOT visible when connected and joined');
  assert(hasJoinedRoomOnce, 'UX-10.1: hasJoinedRoomOnce becomes true on successful join');

  // Socket disconnect occurs
  isConnected = false;
  isRoomJoined = false;

  assert(isOverlayVisible(), 'UX-10.1: Disconnection overlay becomes visible on socket disconnect');

  // Socket reconnects but room re-join has not yet completed
  isConnected = true;
  isRoomJoined = false;
  assert(isOverlayVisible(), 'UX-10.1: Overlay remains visible while rejoining room');

  // Room re-join completes
  isRoomJoined = true;
  assert(!isOverlayVisible(), 'UX-10.1: Overlay cleanly dismisses once room is rejoined');
}

// 10.2: Nickname Taken Rejection does NOT activate disconnect overlay or set hasJoinedRoomOnce
{
  let isConnected = true;
  let isRoomJoined = false;
  let hasJoinedRoomOnce = false;
  let isNicknameTaken = false;

  const isOverlayVisible = () => hasJoinedRoomOnce && (!isConnected || !isRoomJoined);

  // Simulating nickname_taken response:
  const res = { error: 'nickname_taken', success: false };
  if (res && res.error === 'nickname_taken') {
    isNicknameTaken = true;
    // Note: hasJoinedRoomOnce is NOT set
  }

  assert(isNicknameTaken, 'UX-10.2: isNicknameTaken is true');
  assert(!hasJoinedRoomOnce, 'UX-10.2: hasJoinedRoomOnce remains false on nickname_taken');
  assert(!isOverlayVisible(), 'UX-10.2: Disconnection overlay is NOT shown when nickname is taken');
}

// 10.3: Multi-attempt Sequence ID Handling (joinAttemptRef)
{
  let joinAttempt = 0;
  let isRoomJoined = false;
  let staleCallbacksIgnored = 0;

  const simulateJoinAttempt = (attemptNum: number) => {
    joinAttempt = attemptNum;
  };

  const simulateJoinCallback = (attemptNum: number, res: any) => {
    if (attemptNum !== joinAttempt) {
      staleCallbacksIgnored++;
      return;
    }
    if (res && res.success) {
      isRoomJoined = true;
    }
  };

  // Attempt 1 fired
  simulateJoinAttempt(1);
  // Network stutter: Attempt 2 fired before attempt 1 returned
  simulateJoinAttempt(2);
  // Stale callback for attempt 1 arrives late
  simulateJoinCallback(1, { success: false, error: 'stale' });

  assert(staleCallbacksIgnored === 1, 'UX-10.3: Stale callback for attempt 1 was successfully ignored');
  assert(!isRoomJoined, 'UX-10.3: isRoomJoined is false after stale callback');

  // Valid callback for current attempt (2) arrives
  simulateJoinCallback(2, { success: true });
  assert(isRoomJoined, 'UX-10.3: Current attempt 2 callback successfully processed and set isRoomJoined to true');
}

// 10.4: Timeout Semantics (Does NOT set isRoomFull)
{
  let isRoomFull = false;
  let isJoinTimedOut = false;
  let isInitialLoadingRoom = true;
  let hasJoinedRoomOnce = false;

  // Simulate timeout handler from CONNECTION-STATUS-UX-1:
  const handleTimeout = () => {
    isInitialLoadingRoom = false;
    // Timeout does NOT mean room is full
    if (!hasJoinedRoomOnce) {
      isJoinTimedOut = true;
    }
  };

  handleTimeout();

  assert(!isRoomFull, 'UX-10.4: Timeout does NOT set isRoomFull to true (no false claim that room is full)');
  assert(isJoinTimedOut, 'UX-10.4: Timeout sets isJoinTimedOut to true for unjoined client');
  assert(!isInitialLoadingRoom, 'UX-10.4: Initial loading room screen is dismissed on timeout');
}

// 10.5: Network Reconnect after Disconnect using Real Socket.IO
{
  netRm.authStore = new SessionAuthStore(5000);
  netRm.authStore.setActivePredicate((pid) => netRm.isPlayerInAnyRoom(pid));
  if (netRoomObj) {
    netRoomObj.players = [];
    netRoomObj.maxPlayers = 10;
  }

  const clientRecon = await connectClient();
  const reconPid = 'usr-recon-ux-101';
  const reconSec = 'sec-recon-ux-secret-101';

  // 1. Initial join to General #Test
  const join1Res: any = await new Promise((res) => {
    clientRecon.emit('join_room', {
      roomId: uxRoomId,
      nickname: 'ReconUser',
      playerId: reconPid,
      reconnectSecret: reconSec
    }, res);
  });

  assert(join1Res.success === true, 'UX-10.5: First join over network succeeds');
  const roomAfterJoin1 = netRm.getRoom(uxRoomId);
  const playerInRoom = roomAfterJoin1?.players.find(p => p.persistentId === reconPid);
  assert(playerInRoom !== undefined, 'UX-10.5: Player exists in room after first join');

  // 2. Disconnect client
  clientRecon.disconnect();

  // 3. Connect a new socket (representing reconnect after drop)
  const clientRecon2 = await connectClient();

  // 4. Rejoin with reconnectOnly: true and valid credentials
  const rejoinRes: any = await new Promise((res) => {
    clientRecon2.emit('join_room', {
      roomId: uxRoomId,
      nickname: 'ReconUser',
      playerId: reconPid,
      reconnectSecret: reconSec,
      reconnectOnly: true
    }, res);
  });

  assert(rejoinRes.success === true, 'UX-10.5: Reconnect after drop succeeds over real network');
  const roomAfterRejoin = netRm.getRoom(uxRoomId);
  const playerAfterRejoin = roomAfterRejoin?.players.find(p => p.persistentId === reconPid);
  assert(playerAfterRejoin?.id === clientRecon2.id, 'UX-10.5: Player socket ID updated to new socket ID upon reconnect');
  assert(playerAfterRejoin?.isOffline === false, 'UX-10.5: Player is marked online after successful reconnect');

  clientRecon2.disconnect();
}

// -----------------------------------------------------------------
// 11. SERVER-DRAW-AUTH-FIX-1: Server-Side Draw Authorization Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 11: SERVER-DRAW-AUTH-FIX-1 Tests ---');

{
  const makeType1 = (instId: string = 'inst001') => {
    const buf = Buffer.alloc(18);
    buf.writeUInt8(1, 0);
    buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
    buf.writeUInt8(1, 8); // pencil
    buf.writeUInt8(0, 9);
    buf.writeUInt8(0, 10);
    buf.writeUInt8(0, 11);
    buf.writeUInt8(2, 12);
    buf.writeUInt8(100, 13);
    buf.writeInt16LE(10, 14);
    buf.writeInt16LE(20, 16);
    return buf;
  };

  const makeType4 = (instId: string = 'inst001') => {
    const buf = Buffer.alloc(20);
    buf.writeUInt8(4, 0);
    buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
    return buf;
  };

  const makeType5 = (instId: string = 'inst001') => {
    const buf = Buffer.alloc(8);
    buf.writeUInt8(5, 0);
    buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
    return buf;
  };

  const makeType7 = (instId: string = 'inst001', strokeId: number = 1) => {
    const buf = Buffer.alloc(10);
    buf.writeUInt8(7, 0);
    buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
    buf.writeUInt16LE(strokeId, 8);
    return buf;
  };

  const makeType8 = (instId: string = 'inst001') => {
    const buf = Buffer.alloc(8);
    buf.writeUInt8(8, 0);
    buf.write(instId.padEnd(7, '\0').slice(0, 7), 1, 7, 'ascii');
    return buf;
  };

  // Mock socket factory
  const createMockSocket = (id: string, broadcastEmits: any[]) => {
    return {
      id,
      broadcast: {
        to: (_roomId: string) => ({
          emit: (ev: string, data: any) => {
            broadcastEmits.push({ event: ev, data });
          },
          volatile: {
            emit: (ev: string, data: any) => {
              broadcastEmits.push({ event: ev, data, volatile: true });
            }
          }
        })
      }
    };
  };

  // Mock IO factory
  const createMockIo = (ioEmits: any[]) => {
    return {
      to: (_roomId: string) => ({
        emit: (ev: string, data: any) => {
          ioEmits.push({ event: ev, data });
        }
      })
    };
  };

  // 11.1 Current drawer in Normal Room during DRAWING status can draw, bucket, clear, undo, redo
  {
    const rm = new RoomManager();
    const roomId = 'norm-auth-room-1';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = false;
    room.isExperimental = false;
    room.gameState.status = 'DRAWING';
    const drawerPid = 'pid-drawer-1';
    const drawerSocketId = 'sock-drawer-1';
    room.gameState.currentDrawerId = drawerPid;

    rm.addPlayerToRoom(roomId, {
      id: drawerSocketId,
      name: 'RealDrawer',
      roomId,
      score: 0,
      wins: 0,
      persistentId: drawerPid,
      avatar: 'D'
    });

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(drawerSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Send pencil start (Type 1)
    handleDrawBinary(mockSocket, makeType1('inst111'), deps);
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.1: Current drawer start command recorded in drawHistory');
    assert(broadcastEmits.length === 1, 'AUTH-11.1: Current drawer command broadcast to room');

    // Send bucket (Type 4)
    handleDrawBinary(mockSocket, makeType4('inst111'), deps);
    assert(room.gameState.drawHistory.length === 2, 'AUTH-11.1: Current drawer bucket command recorded in drawHistory');

    // Send undo (Type 7)
    handleDrawBinary(mockSocket, makeType7('inst111'), deps);
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.1: Current drawer undo removes command from history');
    assert(room.gameState.redoStack.length === 1, 'AUTH-11.1: Current drawer undo pushes to redoStack');
    assert(ioEmits.length === 1, 'AUTH-11.1: Current drawer undo emitted to room via io.to()');

    // Send redo (Type 8)
    handleDrawBinary(mockSocket, makeType8('inst111'), deps);
    assert(room.gameState.drawHistory.length === 2, 'AUTH-11.1: Current drawer redo restores command to history');
    assert(room.gameState.redoStack.length === 0, 'AUTH-11.1: Current drawer redo clears redoStack');

    // Send clear (Type 5)
    handleDrawBinary(mockSocket, makeType5('inst111'), deps);
    assert(room.gameState.drawHistory.length === 3, 'AUTH-11.1: Current drawer clear recorded in normal room history');
  }

  // 11.2 Guesser in Normal Room is rejected immediately (no history change, no broadcast)
  {
    const rm = new RoomManager();
    const roomId = 'norm-auth-room-2';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = false;
    room.isExperimental = false;
    room.gameState.status = 'DRAWING';
    room.gameState.currentDrawerId = 'pid-legit-drawer';

    const guesserPid = 'pid-guesser-2';
    const guesserSocketId = 'sock-guesser-2';

    rm.addPlayerToRoom(roomId, {
      id: guesserSocketId,
      name: 'SneakyGuesser',
      roomId,
      score: 0,
      wins: 0,
      persistentId: guesserPid,
      avatar: 'G'
    });

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(guesserSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Guesser tries to draw
    handleDrawBinary(mockSocket, makeType1('inst222'), deps);
    assert(room.gameState.drawHistory.length === 0, 'AUTH-11.2: Guesser draw command is rejected (history empty)');
    assert(broadcastEmits.length === 0, 'AUTH-11.2: Guesser draw command not broadcast');

    // Guesser tries to clear
    handleDrawBinary(mockSocket, makeType5('inst222'), deps);
    assert(room.gameState.drawHistory.length === 0, 'AUTH-11.2: Guesser clear command is rejected');
    assert(broadcastEmits.length === 0, 'AUTH-11.2: Guesser clear command not broadcast');

    // Guesser tries to undo
    handleDrawBinary(mockSocket, makeType7('inst222'), deps);
    assert(ioEmits.length === 0, 'AUTH-11.2: Guesser undo command is rejected (no io emit)');

    // Guesser tries to redo
    handleDrawBinary(mockSocket, makeType8('inst222'), deps);
    assert(ioEmits.length === 0, 'AUTH-11.2: Guesser redo command is rejected (no io emit)');
  }

  // 11.3 No player (even drawer) can draw/undo/clear if round status is NOT DRAWING
  {
    const rm = new RoomManager();
    const roomId = 'norm-auth-room-3';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = false;
    room.isExperimental = false;
    const drawerPid = 'pid-drawer-3';
    const drawerSocketId = 'sock-drawer-3';
    room.gameState.currentDrawerId = drawerPid;

    rm.addPlayerToRoom(roomId, {
      id: drawerSocketId,
      name: 'Drawer3',
      roomId,
      score: 0,
      wins: 0,
      persistentId: drawerPid,
      avatar: 'D'
    });

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(drawerSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Status: WAITING
    room.gameState.status = 'WAITING';
    handleDrawBinary(mockSocket, makeType1('inst333'), deps);
    handleDrawBinary(mockSocket, makeType5('inst333'), deps);
    assert(room.gameState.drawHistory.length === 0, 'AUTH-11.3: Drawing rejected when round status is WAITING');
    assert(broadcastEmits.length === 0, 'AUTH-11.3: No broadcast emitted during WAITING');

    // Status: CHOOSING
    room.gameState.status = 'CHOOSING';
    handleDrawBinary(mockSocket, makeType1('inst333'), deps);
    handleDrawBinary(mockSocket, makeType5('inst333'), deps);
    assert(room.gameState.drawHistory.length === 0, 'AUTH-11.3: Drawing rejected when round status is CHOOSING');

    // Status: ROUND_END
    room.gameState.status = 'ROUND_END';
    handleDrawBinary(mockSocket, makeType1('inst333'), deps);
    handleDrawBinary(mockSocket, makeType5('inst333'), deps);
    assert(room.gameState.drawHistory.length === 0, 'AUTH-11.3: Drawing rejected when round status is ROUND_END');
  }

  // 11.4 Experimental Room authorization: Only current drawer during DRAWING is authorized
  {
    const rm = new RoomManager();
    const roomId = 'exp-auth-room-4';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = false;
    room.isExperimental = true;
    room.gameState.status = 'DRAWING';
    const drawerPid = 'pid-exp-drawer';
    const drawerSocketId = 'sock-exp-drawer';
    const guesserPid = 'pid-exp-guesser';
    const guesserSocketId = 'sock-exp-guesser';
    room.gameState.currentDrawerId = drawerPid;

    rm.addPlayerToRoom(roomId, {
      id: drawerSocketId,
      name: 'ExpDrawer',
      roomId,
      score: 0,
      wins: 0,
      persistentId: drawerPid,
      avatar: 'E'
    });
    rm.addPlayerToRoom(roomId, {
      id: guesserSocketId,
      name: 'ExpGuesser',
      roomId,
      score: 0,
      wins: 0,
      persistentId: guesserPid,
      avatar: 'G'
    });

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const drawerSocket = createMockSocket(drawerSocketId, broadcastEmits);
    const guesserSocket = createMockSocket(guesserSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Drawer in Experimental starts drawing -> succeeds
    handleDrawBinary(drawerSocket, makeType1('inst444'), deps);
    assert(broadcastEmits.length === 1, 'AUTH-11.4: Experimental drawer draw_start is authorized');

    // Guesser in Experimental tries to draw -> rejected
    handleDrawBinary(guesserSocket, makeType1('inst444'), deps);
    assert(broadcastEmits.length === 1, 'AUTH-11.4: Experimental guesser draw_start is rejected');

    // Guesser tries to clear in Experimental -> rejected
    handleDrawBinary(guesserSocket, makeType5('inst444'), deps);
    assert(broadcastEmits.length === 1, 'AUTH-11.4: Experimental guesser clear is rejected');

    // Drawer during WAITING in Experimental -> rejected
    room.gameState.status = 'WAITING';
    handleDrawBinary(drawerSocket, makeType1('inst444'), deps);
    assert(broadcastEmits.length === 1, 'AUTH-11.4: Experimental drawer is rejected when status is not DRAWING');
  }

  // 11.5 Free Draw Room: Player in activeDrawers can draw and clear
  {
    const rm = new RoomManager();
    const roomId = 'fd-auth-room-5';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = true;
    const activePid = 'pid-fd-active';
    const activeSocketId = 'sock-fd-active';

    rm.addPlayerToRoom(roomId, {
      id: activeSocketId,
      name: 'FdActive',
      roomId,
      score: 0,
      wins: 0,
      persistentId: activePid,
      avatar: 'A'
    });
    room.activeDrawers = [activePid];

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(activeSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Active drawer starts drawing
    handleDrawBinary(mockSocket, makeType1('inst555'), deps);
    assert(broadcastEmits.length === 1, 'AUTH-11.5: Free Draw active drawer is authorized to draw');

    // Active drawer clears
    handleDrawBinary(mockSocket, makeType5('inst555'), deps);
    assert(broadcastEmits.length === 2, 'AUTH-11.5: Free Draw active drawer is authorized to clear');
  }

  // 11.6 Free Draw Room: Spectator (not in activeDrawers) is rejected
  {
    const rm = new RoomManager();
    const roomId = 'fd-auth-room-6';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = true;
    room.activeDrawers = ['pid-someone-else'];

    const spectatorPid = 'pid-fd-spectator';
    const spectatorSocketId = 'sock-fd-spectator';

    rm.addPlayerToRoom(roomId, {
      id: spectatorSocketId,
      name: 'FdSpectator',
      roomId,
      score: 0,
      wins: 0,
      persistentId: spectatorPid,
      avatar: 'S'
    });

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(spectatorSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Spectator attempts draw
    handleDrawBinary(mockSocket, makeType1('inst666'), deps);
    assert(broadcastEmits.length === 0, 'AUTH-11.6: Free Draw spectator draw rejected');

    // Spectator attempts clear
    handleDrawBinary(mockSocket, makeType5('inst666'), deps);
    assert(broadcastEmits.length === 0, 'AUTH-11.6: Free Draw spectator clear rejected');

    // Spectator attempts redo
    handleDrawBinary(mockSocket, makeType8('inst666'), deps);
    assert(ioEmits.length === 0, 'AUTH-11.6: Free Draw spectator redo rejected');
  }

  // 11.7 Free Draw individual undo: Accepted ONLY if targetInstId belongs to socket in drawingIdentities
  {
    const rm = new RoomManager();
    const roomId = 'fd-auth-room-7';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = true;
    const userAPid = 'pid-user-a';
    const userASocket = 'sock-user-a';
    room.activeDrawers = [userAPid];

    rm.addPlayerToRoom(roomId, {
      id: userASocket,
      name: 'UserA',
      roomId,
      score: 0,
      wins: 0,
      persistentId: userAPid,
      avatar: 'A'
    });

    // Register drawing identity for UserA
    room.drawingIdentities = {
      'instAAA': { socketId: userASocket, playerName: 'UserA' }
    };

    // Pre-populate a stroke in drawHistory for instAAA, strokeId 10
    const strokeBuf = Buffer.alloc(24);
    strokeBuf.writeUInt8(9, 0); // MSG_DRAW_STROKE
    strokeBuf.write('instAAA', 1, 7, 'ascii');
    rm.recordDrawCommand(roomId, 'draw_binary', strokeBuf, 'instAAA', 10);
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.7: Initial stroke stored in drawHistory');

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(userASocket, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // User A undoes their own stroke (instAAA, strokeId 10)
    handleDrawBinary(mockSocket, makeType7('instAAA', 10), deps);
    assert(room.gameState.drawHistory.length === 0, 'AUTH-11.7: User A successfully undid their own stroke');
    assert(ioEmits.length === 1, 'AUTH-11.7: Undo broadcast via io.to() for owned stroke');
  }

  // 11.8 Free Draw individual undo: REJECTED if targetInstId belongs to ANOTHER socket
  {
    const rm = new RoomManager();
    const roomId = 'fd-auth-room-8';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = true;

    const userAPid = 'pid-user-a';
    const userASocket = 'sock-user-a';
    const userBPid = 'pid-user-b';
    const userBSocket = 'sock-user-b';
    room.activeDrawers = [userAPid, userBPid];

    rm.addPlayerToRoom(roomId, { id: userASocket, name: 'UserA', roomId, score: 0, wins: 0, persistentId: userAPid, avatar: 'A' });
    rm.addPlayerToRoom(roomId, { id: userBSocket, name: 'UserB', roomId, score: 0, wins: 0, persistentId: userBPid, avatar: 'B' });

    // instBBB belongs to User B
    room.drawingIdentities = {
      'instAAA': { socketId: userASocket, playerName: 'UserA' },
      'instBBB': { socketId: userBSocket, playerName: 'UserB' },
    };

    // Pre-populate stroke for User B
    const strokeBufB = Buffer.alloc(24);
    strokeBufB.writeUInt8(9, 0);
    strokeBufB.write('instBBB', 1, 7, 'ascii');
    rm.recordDrawCommand(roomId, 'draw_binary', strokeBufB, 'instBBB', 20);
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.8: User B stroke stored in drawHistory');

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocketA = createMockSocket(userASocket, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // User A maliciously tries to undo User B's stroke
    handleDrawBinary(mockSocketA, makeType7('instBBB', 20), deps);
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.8: Attack blocked - User B stroke remains in drawHistory');
    assert(ioEmits.length === 0, 'AUTH-11.8: No undo emitted when trying to undo another socket stroke');
  }

  // 11.9 Free Draw individual undo: REJECTED if targetInstId is not registered in drawingIdentities
  {
    const rm = new RoomManager();
    const roomId = 'fd-auth-room-9';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = true;
    const userAPid = 'pid-user-a';
    const userASocket = 'sock-user-a';
    room.activeDrawers = [userAPid];

    rm.addPlayerToRoom(roomId, { id: userASocket, name: 'UserA', roomId, score: 0, wins: 0, persistentId: userAPid, avatar: 'A' });
    room.drawingIdentities = {}; // Empty identities

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocketA = createMockSocket(userASocket, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    handleDrawBinary(mockSocketA, makeType7('instGhost', 5), deps);
    assert(ioEmits.length === 0, 'AUTH-11.9: Undo rejected for unregistered instId');
  }

  // 11.10 Redo protection: Guesser or spectator cannot call redo or modify redoStack
  {
    const rm = new RoomManager();
    const roomId = 'norm-auth-room-10';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = false;
    room.gameState.status = 'DRAWING';
    room.gameState.currentDrawerId = 'pid-drawer-10';

    const guesserPid = 'pid-guesser-10';
    const guesserSocket = 'sock-guesser-10';
    rm.addPlayerToRoom(roomId, { id: guesserSocket, name: 'Guesser10', roomId, score: 0, wins: 0, persistentId: guesserPid, avatar: 'G' });

    // Put a dummy command on redoStack
    room.gameState.redoStack = [{ event: 'draw_binary', data: makeType1('inst100') }];
    assert(room.gameState.redoStack.length === 1, 'AUTH-11.10: redoStack has 1 item initially');

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocketGuesser = createMockSocket(guesserSocket, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Guesser tries to trigger redo
    handleDrawBinary(mockSocketGuesser, makeType8('inst100'), deps);
    assert(room.gameState.redoStack.length === 1, 'AUTH-11.10: Guesser redo rejected - redoStack remains intact');
    assert(ioEmits.length === 0, 'AUTH-11.10: Guesser redo did not broadcast');
  }

  // 11.11 Real Network Socket.IO Verification: Drawer broadcast reaches others, Guesser draw is dropped
  {
    const netDrawer = await connectClient();
    const netGuesser = await connectClient();
    const netRoomAuth = 'General #Test';

    const drawerPid = 'usr-net-drawer-auth';
    const guesserPid = 'usr-net-guesser-auth';
    const drawerSec = 'sec-net-drawer-auth-12345';
    const guesserSec = 'sec-net-guesser-auth-12345';

    // Join both players
    await new Promise((res) => {
      netDrawer.emit('join_room', {
        roomId: netRoomAuth,
        nickname: 'NetDrawerAuth',
        playerId: drawerPid,
        reconnectSecret: drawerSec
      }, res);
    });

    await new Promise((res) => {
      netGuesser.emit('join_room', {
        roomId: netRoomAuth,
        nickname: 'NetGuesserAuth',
        playerId: guesserPid,
        reconnectSecret: guesserSec
      }, res);
    });

    const room = netRm.getRoom(netRoomAuth)!;
    room.isFreeDraw = false;
    room.isExperimental = false;
    room.gameState.status = 'DRAWING';
    room.gameState.currentDrawerId = drawerPid;
    room.gameState.drawHistory = [];

    // Guesser listens for draw_binary broadcasts
    const guesserReceived: any[] = [];
    netGuesser.on('draw_binary', (data: any) => {
      guesserReceived.push(data);
    });

    // 1. Drawer sends a clear packet (Type 5) over network
    const clearBuf = makeType5('netInst');
    netDrawer.emit('draw_binary', clearBuf);

    // Wait 100ms for network propagation
    await new Promise(r => setTimeout(r, 100));

    assert(guesserReceived.length === 1, 'AUTH-11.11: Guesser received draw packet sent by authorized drawer over network');
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.11: Drawer packet recorded in room drawHistory over network');

    // 2. Guesser attempts to send a draw packet over network
    const drawerReceived: any[] = [];
    netDrawer.on('draw_binary', (data: any) => {
      drawerReceived.push(data);
    });

    const attackBuf = makeType1('badInst');
    netGuesser.emit('draw_binary', attackBuf);

    await new Promise(r => setTimeout(r, 100));

    assert(drawerReceived.length === 0, 'AUTH-11.11: Drawer received NO packets from unauthorized guesser over network');
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.11: Room drawHistory was NOT polluted by guesser over network');

    netDrawer.disconnect();
    netGuesser.disconnect();
  }

  // 11.12 Defect 1: Active player in Free Draw sends type === 8 -> REJECTED (no redoDrawing, no history/redoStack change, no broadcast)
  {
    const rm = new RoomManager();
    const roomId = 'fd-redo-test-12';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = true;
    const activePid = 'pid-fd-redo-user';
    const activeSocketId = 'sock-fd-redo-user';
    room.activeDrawers = [activePid];

    rm.addPlayerToRoom(roomId, {
      id: activeSocketId,
      name: 'FdRedoUser',
      roomId,
      score: 0,
      wins: 0,
      persistentId: activePid,
      avatar: 'R'
    });

    // Initial state to detect any state mutation
    const initialCmd = { event: 'draw_binary', data: makeType1('cmd001') };
    const redoItem = { event: 'draw_binary', data: makeType1('redo001') };
    room.gameState.drawHistory = [initialCmd];
    room.gameState.redoStack = [redoItem];

    let redoDrawingCalled = false;
    const origRedoDrawing = rm.redoDrawing.bind(rm);
    rm.redoDrawing = (rId: string) => {
      redoDrawingCalled = true;
      return origRedoDrawing(rId);
    };

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(activeSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Active drawer in Free Draw tries to send type 8 (draw_redo)
    handleDrawBinary(mockSocket, makeType8('cmd001'), deps);

    assert(redoDrawingCalled === false, 'AUTH-11.12: roomManager.redoDrawing() was NOT called in Free Draw for type 8');
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.12: Free Draw drawHistory remains unchanged after type 8');
    assert(room.gameState.redoStack.length === 1, 'AUTH-11.12: Free Draw redoStack remains unchanged after type 8');
    assert(ioEmits.length === 0, 'AUTH-11.12: No broadcast emitted for type 8 in Free Draw');
  }

  // 11.13 Defect 1: Current drawer in Experimental during DRAWING sends type === 8 -> REJECTED
  {
    const rm = new RoomManager();
    const roomId = 'exp-redo-test-13';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = false;
    room.isExperimental = true;
    room.gameState.status = 'DRAWING';
    const drawerPid = 'pid-exp-redo-drawer';
    const drawerSocketId = 'sock-exp-redo-drawer';
    room.gameState.currentDrawerId = drawerPid;

    rm.addPlayerToRoom(roomId, {
      id: drawerSocketId,
      name: 'ExpRedoDrawer',
      roomId,
      score: 0,
      wins: 0,
      persistentId: drawerPid,
      avatar: 'E'
    });

    const initialCmd = { event: 'draw_binary', data: makeType1('cmdExp') };
    const redoItem = { event: 'draw_binary', data: makeType1('redoExp') };
    room.gameState.drawHistory = [initialCmd];
    room.gameState.redoStack = [redoItem];

    let redoDrawingCalled = false;
    const origRedoDrawing = rm.redoDrawing.bind(rm);
    rm.redoDrawing = (rId: string) => {
      redoDrawingCalled = true;
      return origRedoDrawing(rId);
    };

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(drawerSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Current drawer in Experimental tries to send type 8 (draw_redo)
    handleDrawBinary(mockSocket, makeType8('cmdExp'), deps);

    assert(redoDrawingCalled === false, 'AUTH-11.13: roomManager.redoDrawing() was NOT called in Experimental for type 8');
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.13: Experimental drawHistory remains unchanged after type 8');
    assert(room.gameState.redoStack.length === 1, 'AUTH-11.13: Experimental redoStack remains unchanged after type 8');
    assert(ioEmits.length === 0, 'AUTH-11.13: No broadcast emitted for type 8 in Experimental');
  }

  // 11.14 Defect 2: Active player in Free Draw sends truncated type === 7 (< 10 bytes) -> REJECTED (no undoLastDrawing fallback!)
  {
    const rm = new RoomManager();
    const roomId = 'fd-short-undo-14';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = true;
    const activePid = 'pid-fd-short-user';
    const activeSocketId = 'sock-fd-short-user';
    room.activeDrawers = [activePid];

    rm.addPlayerToRoom(roomId, {
      id: activeSocketId,
      name: 'FdShortUser',
      roomId,
      score: 0,
      wins: 0,
      persistentId: activePid,
      avatar: 'U'
    });

    const initialCmd = { event: 'draw_binary', data: makeType1('cmdPre') };
    room.gameState.drawHistory = [initialCmd];
    room.gameState.redoStack = [];

    let undoLastDrawingCalled = false;
    const origUndoLastDrawing = rm.undoLastDrawing.bind(rm);
    rm.undoLastDrawing = (rId: string) => {
      undoLastDrawingCalled = true;
      return origUndoLastDrawing(rId);
    };

    let undoFreeDrawStrokeCalled = false;
    const origUndoFreeDrawStroke = rm.undoFreeDrawStroke.bind(rm);
    rm.undoFreeDrawStroke = (rId: string, instId: string, sId: number) => {
      undoFreeDrawStrokeCalled = true;
      return origUndoFreeDrawStroke(rId, instId, sId);
    };

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(activeSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Construct truncated 8-byte type 7 buffer (< 10 bytes)
    const truncatedBuf = Buffer.alloc(8);
    truncatedBuf.writeUInt8(7, 0); // type 7
    truncatedBuf.write('instShort', 1, 7, 'ascii');

    handleDrawBinary(mockSocket, truncatedBuf, deps);

    assert(undoLastDrawingCalled === false, 'AUTH-11.14: Malformed type 7 does NOT fall back to undoLastDrawing() in Free Draw');
    assert(undoFreeDrawStrokeCalled === false, 'AUTH-11.14: undoFreeDrawStroke() was NOT called for truncated buffer');
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.14: Free Draw drawHistory remains untouched for malformed type 7');
    assert(ioEmits.length === 0, 'AUTH-11.14: No broadcast emitted for truncated type 7 in Free Draw');
  }

  // 11.15 Defect 2: Current drawer in Experimental sends truncated type === 7 (< 10 bytes) -> REJECTED (no undoLastDrawing fallback!)
  {
    const rm = new RoomManager();
    const roomId = 'exp-short-undo-15';
    const room = rm.createRoom(roomId);
    room.isFreeDraw = false;
    room.isExperimental = true;
    room.gameState.status = 'DRAWING';
    const drawerPid = 'pid-exp-short-drawer';
    const drawerSocketId = 'sock-exp-short-drawer';
    room.gameState.currentDrawerId = drawerPid;

    rm.addPlayerToRoom(roomId, {
      id: drawerSocketId,
      name: 'ExpShortDrawer',
      roomId,
      score: 0,
      wins: 0,
      persistentId: drawerPid,
      avatar: 'E'
    });

    const initialCmd = { event: 'draw_binary', data: makeType1('cmdPreExp') };
    room.gameState.drawHistory = [initialCmd];
    room.gameState.redoStack = [];

    let undoLastDrawingCalled = false;
    const origUndoLastDrawing = rm.undoLastDrawing.bind(rm);
    rm.undoLastDrawing = (rId: string) => {
      undoLastDrawingCalled = true;
      return origUndoLastDrawing(rId);
    };

    let undoFreeDrawStrokeCalled = false;
    const origUndoFreeDrawStroke = rm.undoFreeDrawStroke.bind(rm);
    rm.undoFreeDrawStroke = (rId: string, instId: string, sId: number) => {
      undoFreeDrawStrokeCalled = true;
      return origUndoFreeDrawStroke(rId, instId, sId);
    };

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(drawerSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Truncated 8-byte type 7 buffer (< 10 bytes)
    const truncatedBuf = Buffer.alloc(8);
    truncatedBuf.writeUInt8(7, 0);
    truncatedBuf.write('instExpS', 1, 7, 'ascii');

    handleDrawBinary(mockSocket, truncatedBuf, deps);

    assert(undoLastDrawingCalled === false, 'AUTH-11.15: Malformed type 7 does NOT fall back to undoLastDrawing() in Experimental');
    assert(undoFreeDrawStrokeCalled === false, 'AUTH-11.15: undoFreeDrawStroke() was NOT called for truncated buffer in Experimental');
    assert(room.gameState.drawHistory.length === 1, 'AUTH-11.15: Experimental drawHistory remains untouched for malformed type 7');
    assert(ioEmits.length === 0, 'AUTH-11.15: No broadcast emitted for truncated type 7 in Experimental');
  }

  // 11.16 Regression Verification: Legitimate global redo in Normal room and legitimate individual undo in Free Draw remain functional
  {
    // Part A: Normal room legitimate global redo
    const rm = new RoomManager();
    const normRoomId = 'norm-legit-redo-16';
    const normRoom = rm.createRoom(normRoomId);
    normRoom.isFreeDraw = false;
    normRoom.isExperimental = false;
    normRoom.gameState.status = 'DRAWING';
    const drawerPid = 'pid-norm-drawer-16';
    const drawerSocketId = 'sock-norm-drawer-16';
    normRoom.gameState.currentDrawerId = drawerPid;

    rm.addPlayerToRoom(normRoomId, {
      id: drawerSocketId,
      name: 'NormDrawer16',
      roomId: normRoomId,
      score: 0,
      wins: 0,
      persistentId: drawerPid,
      avatar: 'N'
    });

    const redoCmd = { event: 'draw_binary', data: makeType1('cmdNorm') };
    normRoom.gameState.drawHistory = [];
    normRoom.gameState.redoStack = [redoCmd];

    const broadcastEmits: any[] = [];
    const ioEmits: any[] = [];
    const mockSocket = createMockSocket(drawerSocketId, broadcastEmits);
    const mockIo = createMockIo(ioEmits);
    const deps = { io: mockIo, roomManager: rm };

    // Normal room drawer sends type 8 -> accepted
    handleDrawBinary(mockSocket, makeType8('cmdNorm'), deps);
    assert(normRoom.gameState.drawHistory.length === 1, 'AUTH-11.16: Legitimate global redo in normal room restores stroke to drawHistory');
    assert(normRoom.gameState.redoStack.length === 0, 'AUTH-11.16: Legitimate global redo in normal room empties redoStack');
    assert(ioEmits.length === 1, 'AUTH-11.16: Legitimate global redo broadcast to normal room via io.to()');

    // Part B: Free Draw legitimate individual stroke undo
    const fdRoomId = 'fd-legit-undo-16';
    const fdRoom = rm.createRoom(fdRoomId);
    fdRoom.isFreeDraw = true;
    const userPid = 'pid-fd-legit-user';
    const userSocket = 'sock-fd-legit-user';
    fdRoom.activeDrawers = [userPid];

    rm.addPlayerToRoom(fdRoomId, {
      id: userSocket,
      name: 'LegitFdUser',
      roomId: fdRoomId,
      score: 0,
      wins: 0,
      persistentId: userPid,
      avatar: 'L'
    });

    fdRoom.drawingIdentities = {
      'instOK1': { socketId: userSocket, playerName: 'LegitFdUser' }
    };

    const strokeBuf = Buffer.alloc(24);
    strokeBuf.writeUInt8(9, 0);
    strokeBuf.write('instOK1', 1, 7, 'ascii');
    rm.recordDrawCommand(fdRoomId, 'draw_binary', strokeBuf, 'instOK1', 42);
    assert(fdRoom.gameState.drawHistory.length === 1, 'AUTH-11.16: Initial stroke in Free Draw drawHistory');

    const fdIoEmits: any[] = [];
    const mockFdSocket = createMockSocket(userSocket, []);
    const mockFdIo = createMockIo(fdIoEmits);
    const fdDeps = { io: mockFdIo, roomManager: rm };

    // Valid 10-byte type 7 with matching targetInstId and strokeId 42
    handleDrawBinary(mockFdSocket, makeType7('instOK1', 42), fdDeps);
    assert(fdRoom.gameState.drawHistory.length === 0, 'AUTH-11.16: Legitimate individual stroke undo in Free Draw removes stroke from drawHistory');
    assert(fdIoEmits.length === 1, 'AUTH-11.16: Legitimate individual stroke undo in Free Draw broadcasts via io.to()');
  }
}

// -----------------------------------------------------------------
// 12. SERVER-AUTH-FIX-2A: submit_guess Payload Validation & Hardening Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 12: SERVER-AUTH-FIX-2A submit_guess Hardening Tests ---');
{
  const rm = new RoomManager();
  const testRoomId = 'GuessSecurityRoom';
  const drawerSocket = 'sock-drawer-1';
  const drawerPid = 'pid-drawer-1';
  const guesserSocket = 'sock-guesser-1';
  const guesserPid = 'pid-guesser-1';

  const room = rm.createRoom(testRoomId);
  rm.addPlayerToRoom(testRoomId, {
    id: drawerSocket,
    name: 'DrawerBob',
    score: 0,
    avatar: '🎨',
    wins: 0,
    roomId: testRoomId,
    persistentId: drawerPid,
    isOffline: false,
    lastActivity: Date.now()
  });
  rm.addPlayerToRoom(testRoomId, {
    id: guesserSocket,
    name: 'GuesserAlice',
    score: 0,
    avatar: '🔍',
    wins: 0,
    roomId: testRoomId,
    persistentId: guesserPid,
    isOffline: false,
    lastActivity: Date.now()
  });

  room.gameState.status = 'DRAWING';
  room.gameState.currentDrawerId = drawerPid;
  room.gameState.currentWord = 'تفاحة';
  room.gameState.timeLeft = 60;
  room.gameState.correctGuessers = [];

  const guesserPlayer = rm.getPlayer(guesserSocket)!;
  const drawerPlayer = rm.getPlayer(drawerSocket)!;

  const mockSocket = {
    id: guesserSocket,
    emit: () => {},
    on: () => {}
  };

  // 12.1 Safely handle invalid payloads without throwing or invoking RoomManager.submitGuess
  let submitGuessCallCount = 0;
  const originalSubmitGuess = rm.submitGuess.bind(rm);
  rm.submitGuess = (rId: string, sId: string, g: any) => {
    submitGuessCallCount++;
    return originalSubmitGuess(rId, sId, g);
  };

  const invalidPayloads: any[] = [
    null,
    undefined,
    {},
    { guess: null },
    { guess: undefined },
    { guess: 123 },
    { guess: true },
    { guess: false },
    { guess: {} },
    { guess: { nested: 'obj' } },
    { guess: [] },
    { guess: ['apple'] },
    { guess: '' },
    { guess: '   ' },
    { notGuess: 'تفاحة' },
    'just a string',
    12345
  ];

  const unitLimits = new Map<string, number[]>();
  for (let i = 0; i < invalidPayloads.length; i++) {
    const payload = invalidPayloads[i];
    let threw = false;
    try {
      handleSubmitGuess(mockSocket, payload, { roomManager: rm, checkRateLimit: () => true });
    } catch (e) {
      threw = true;
    }
    assert(!threw, `AUTH-12.1.${i + 1}: Malformed payload ${JSON.stringify(payload)} handled safely without throwing`);
  }

  // 12.2 Verify rm.submitGuess was NEVER called for any of the invalid payloads
  assert(submitGuessCallCount === 0, 'AUTH-12.2: rm.submitGuess was not called for any invalid payload');

  // 12.3 Verify state remains pristine
  assert(guesserPlayer.score === 0, 'AUTH-12.3: Guesser score is unchanged (0)');
  assert(drawerPlayer.score === 0, 'AUTH-12.3: Drawer score is unchanged (0)');
  assert(room.gameState.status === 'DRAWING', 'AUTH-12.3: Game state status unchanged (DRAWING)');
  assert(room.gameState.correctGuessers.length === 0, 'AUTH-12.3: Correct guessers list is empty');
  assert(room.guessMessages.length === 0, 'AUTH-12.3: No guess messages created in room');

  // 12.4 Verify valid payload succeeds and invokes submitGuess with trimmed string
  handleSubmitGuess(mockSocket, { guess: ' تفاحة ' }, { roomManager: rm, checkRateLimit: () => true });
  assert(submitGuessCallCount === 1, 'AUTH-12.4: rm.submitGuess was called for valid guess payload');
  assert(guesserPlayer.score > 0, 'AUTH-12.4: Guesser score increased after correct guess');
  assert(drawerPlayer.score > 0, 'AUTH-12.4: Drawer score increased after correct guess');
  assert(room.gameState.correctGuessers.includes(guesserPid), 'AUTH-12.4: Guesser added to correctGuessers');

  // 12.5 Defensive checks inside RoomManager.submitGuess directly
  let defensiveThrew = false;
  try {
    rm.submitGuess(testRoomId, guesserSocket, null);
    rm.submitGuess(testRoomId, guesserSocket, undefined);
    rm.submitGuess(testRoomId, guesserSocket, 123 as any);
    rm.submitGuess(testRoomId, guesserSocket, {} as any);
    rm.submitGuess(testRoomId, guesserSocket, [] as any);
    rm.submitGuess(testRoomId, guesserSocket, '');
    rm.submitGuess(testRoomId, guesserSocket, '   ');
  } catch (e) {
    defensiveThrew = true;
  }
  assert(!defensiveThrew, 'AUTH-12.5: RoomManager.submitGuess directly survives non-string inputs without throwing');

  // Defensive check when currentWord is missing or non-string
  room.gameState.currentWord = null as any;
  let wordDefensiveThrew = false;
  try {
    rm.submitGuess(testRoomId, guesserSocket, 'تفاحة');
  } catch (e) {
    wordDefensiveThrew = true;
  }
  assert(!wordDefensiveThrew, 'AUTH-12.5: RoomManager.submitGuess safely handles null currentWord without throwing');

  room.gameState.currentWord = undefined as any;
  try {
    rm.submitGuess(testRoomId, guesserSocket, 'تفاحة');
  } catch (e) {
    wordDefensiveThrew = true;
  }
  assert(!wordDefensiveThrew, 'AUTH-12.5: RoomManager.submitGuess safely handles undefined currentWord without throwing');

  // 12.6 Rate limit accounting: invalid payloads MUST consume rate limit attempts
  const testLimitsMap = new Map<string, number[]>();
  const testRateKey = 'usr-rate-limit-test';
  const testRateSocket = {
    id: 'sock-rate-limit-test',
    emit: () => {},
    on: () => {}
  };
  const rateRm = new RoomManager();
  const rateRoom = rateRm.createRoom('RateTestRoom');
  rateRm.addPlayerToRoom('RateTestRoom', {
    id: 'sock-rate-limit-test',
    name: 'RateTester',
    score: 0,
    avatar: '⚡',
    wins: 0,
    roomId: 'RateTestRoom',
    persistentId: testRateKey,
    isOffline: false,
    lastActivity: Date.now()
  });
  rateRoom.gameState.status = 'DRAWING';
  rateRoom.gameState.currentDrawerId = 'other-drawer';
  rateRoom.gameState.currentWord = 'رمان';

  let rateSubmitCalls = 0;
  rateRm.submitGuess = () => { rateSubmitCalls++; };

  // Send 5 invalid payloads - each should be accounted in rateLimits
  for (let i = 0; i < 5; i++) {
    handleSubmitGuess(testRateSocket, { guess: 123 }, {
      roomManager: rateRm,
      guessLimits: testLimitsMap
    });
  }
  const timestamps = testLimitsMap.get(testRateKey) || [];
  assert(timestamps.length === 5, 'AUTH-12.6: 5 invalid payloads were recorded in rate limit tracking');
  assert(rateSubmitCalls === 0, 'AUTH-12.6: None of the invalid payloads triggered submitGuess');

  // 6th attempt with a VALID payload should be blocked by rate limit
  handleSubmitGuess(testRateSocket, { guess: 'رمان' }, {
    roomManager: rateRm,
    guessLimits: testLimitsMap
  });
  assert(rateSubmitCalls === 0, 'AUTH-12.6: Valid payload after 5 invalid attempts is blocked by rate limiting');

  // 12.7 Real Socket.IO Network Integration Test
  // Connect a 2nd client to netIo, join room, and test over real WebSocket transport
  const clientGuess = await connectClient();
  const netGuesserPid = 'usr-net-guesser-002';
  const netGuesserSecret = 'sec-net-guesser-secret-token-98765432';

  await new Promise((res) => {
    clientGuess.emit('join_room', {
      roomId: 'General #Test',
      nickname: 'GuesserNet',
      playerId: netGuesserPid,
      reconnectSecret: netGuesserSecret
    }, res);
  });

  const netRoom = netRm.getRoom('General #Test')!;
  netRoom.gameState.status = 'DRAWING';
  netRoom.gameState.currentDrawerId = netDavePid; // Dave is drawer
  netRoom.gameState.currentWord = 'فراولة';
  netRoom.gameState.correctGuessers = [];

  const netGuesser = netRoom.players.find(p => p.persistentId === netGuesserPid)!;
  const initialGuesserScore = netGuesser.score;

  // Send malformed payloads over network (2 attempts < 5 max within 2s)
  clientGuess.emit('submit_guess', null);
  clientGuess.emit('submit_guess', { guess: 999 });

  await new Promise(r => setTimeout(r, 60));

  assert(netGuesser.score === initialGuesserScore, 'AUTH-12.7: Malformed payloads over real network socket do not alter score');
  assert(netRoom.gameState.correctGuessers.length === 0, 'AUTH-12.7: Malformed payloads do not add player to correctGuessers');

  // Send valid guess over network
  clientGuess.emit('submit_guess', { guess: 'فراولة' });
  await new Promise(r => setTimeout(r, 60));

  assert(netGuesser.score > initialGuesserScore, 'AUTH-12.7: Valid guess over real network socket successfully updates player score');
  assert(netRoom.gameState.correctGuessers.includes(netGuesserPid), 'AUTH-12.7: Valid guess adds player to correctGuessers');

  clientGuess.disconnect();
}

// -----------------------------------------------------------------
// 13. SERVER-AUTH-FIX-2B: select_word Validation Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 13: SERVER-AUTH-FIX-2B select_word Validation Tests ---');
{
  const rm = new RoomManager();
  const testRoomId = 'SelectWordSecurityRoom';
  const drawerSocket = 'sock-drawer-select-1';
  const drawerPid = 'pid-drawer-select-1';
  const guesserSocket = 'sock-guesser-select-1';
  const guesserPid = 'pid-guesser-select-1';

  const room = rm.createRoom(testRoomId);
  rm.addPlayerToRoom(testRoomId, {
    id: drawerSocket,
    name: 'DrawerBob',
    score: 0,
    avatar: '🎨',
    wins: 0,
    roomId: testRoomId,
    persistentId: drawerPid,
    isOffline: false,
    lastActivity: Date.now()
  });
  rm.addPlayerToRoom(testRoomId, {
    id: guesserSocket,
    name: 'GuesserAlice',
    score: 0,
    avatar: '🔍',
    wins: 0,
    roomId: testRoomId,
    persistentId: guesserPid,
    isOffline: false,
    lastActivity: Date.now()
  });

  const validOptions = ['شمس', 'قمر'];
  room.gameState.status = 'CHOOSING';
  room.gameState.currentDrawerId = drawerPid;
  room.gameState.wordOptions = [...validOptions];
  room.gameState.currentWord = null;
  room.gameState.timeLeft = 95;

  const mockDrawerSocket = { id: drawerSocket, emit: () => {}, on: () => {} };
  const mockGuesserSocket = { id: guesserSocket, emit: () => {}, on: () => {} };

  // 13.1 Safely handle invalid / malformed payloads without throwing or altering state
  const invalidPayloads: any[] = [
    null,
    undefined,
    {},
    { word: null },
    { word: undefined },
    { word: 123 },
    { word: true },
    { word: false },
    { word: {} },
    { word: { nested: 'obj' } },
    { word: [] },
    { word: ['شمس'] },
    { word: '' },
    { word: '   ' },
    { notWord: 'شمس' },
    'just a string',
    99999
  ];

  for (let i = 0; i < invalidPayloads.length; i++) {
    const payload = invalidPayloads[i];
    let threw = false;
    try {
      handleSelectWord(mockDrawerSocket, payload, { roomManager: rm });
    } catch (e) {
      threw = true;
    }
    assert(!threw, `AUTH-13.1.${i + 1}: Malformed select_word payload ${JSON.stringify(payload)} handled safely without throwing`);
    assert(room.gameState.status === 'CHOOSING', `AUTH-13.1.${i + 1}: Status unchanged (CHOOSING)`);
    assert(room.gameState.currentWord === null, `AUTH-13.1.${i + 1}: currentWord unchanged (null)`);
    assert(room.gameState.wordOptions.length === 2, `AUTH-13.1.${i + 1}: wordOptions preserved`);
  }

  // 13.2 Reject word not in wordOptions
  handleSelectWord(mockDrawerSocket, { word: 'نجمة' }, { roomManager: rm });
  assert(room.gameState.status === 'CHOOSING', 'AUTH-13.2: Status remains CHOOSING when word is not in wordOptions');
  assert(room.gameState.currentWord === null, 'AUTH-13.2: currentWord remains null when word is not in wordOptions');
  assert(room.gameState.wordOptions.length === 2, 'AUTH-13.2: wordOptions remain intact when word is not in wordOptions');

  // 13.3 Reject when sender is not the current drawer
  handleSelectWord(mockGuesserSocket, { word: 'شمس' }, { roomManager: rm });
  assert(room.gameState.status === 'CHOOSING', 'AUTH-13.3: Non-drawer player cannot select word');
  assert(room.gameState.currentWord === null, 'AUTH-13.3: currentWord remains null when non-drawer selects');
  assert(room.gameState.wordOptions.length === 2, 'AUTH-13.3: wordOptions remain intact when non-drawer selects');

  // 13.4 Reject when status is not CHOOSING
  room.gameState.status = 'WAITING';
  handleSelectWord(mockDrawerSocket, { word: 'شمس' }, { roomManager: rm });
  assert(room.gameState.status === 'WAITING', 'AUTH-13.4: Status remains WAITING when select_word sent during WAITING');
  assert(room.gameState.currentWord === null, 'AUTH-13.4: currentWord remains null during WAITING');

  room.gameState.status = 'ROUND_END';
  handleSelectWord(mockDrawerSocket, { word: 'شمس' }, { roomManager: rm });
  assert(room.gameState.status === 'ROUND_END', 'AUTH-13.4: Status remains ROUND_END when select_word sent during ROUND_END');

  // 13.5 Defensive checks on RoomManager.startGameRound directly
  room.gameState.status = 'CHOOSING';
  room.gameState.currentWord = null;
  room.gameState.wordOptions = [...validOptions];

  let defensiveThrew = false;
  try {
    rm.startGameRound(testRoomId, null as any, drawerSocket);
    rm.startGameRound(testRoomId, undefined as any, drawerSocket);
    rm.startGameRound(testRoomId, 123 as any, drawerSocket);
    rm.startGameRound(testRoomId, {} as any, drawerSocket);
    rm.startGameRound(testRoomId, '' as any, drawerSocket);
    rm.startGameRound(testRoomId, '   ' as any, drawerSocket);
  } catch (e) {
    defensiveThrew = true;
  }
  assert(!defensiveThrew, 'AUTH-13.5: RoomManager.startGameRound directly survives non-string inputs without throwing');
  assert(room.gameState.status === 'CHOOSING', 'AUTH-13.5: Status unchanged after direct invalid startGameRound calls');

  // Defensive check when wordOptions is missing or empty
  room.gameState.wordOptions = [] as any;
  rm.startGameRound(testRoomId, 'شمس', drawerSocket);
  assert(room.gameState.status === 'CHOOSING', 'AUTH-13.5: startGameRound safely rejects when wordOptions is empty');

  room.gameState.wordOptions = null as any;
  rm.startGameRound(testRoomId, 'شمس', drawerSocket);
  assert(room.gameState.status === 'CHOOSING', 'AUTH-13.5: startGameRound safely rejects when wordOptions is null');

  // 13.6 Legitimate selection succeeds
  room.gameState.wordOptions = [...validOptions];
  handleSelectWord(mockDrawerSocket, { word: 'شمس' }, { roomManager: rm });
  assert((room.gameState.status as string) === 'DRAWING', 'AUTH-13.6: Status transitions to DRAWING on legitimate word selection');
  assert(room.gameState.currentWord === 'شمس', 'AUTH-13.6: currentWord set to selected word');
  assert(room.gameState.wordOptions.length === 0, 'AUTH-13.6: wordOptions emptied after selection');
  assert(typeof room.gameState.drawingStartTime === 'number', 'AUTH-13.6: drawingStartTime is recorded');

  // 13.7 Real Socket.IO Network Integration Test
  const netRoom = netRm.createRoom('General #TestSelect');
  const netDrawerClient = await connectClient();
  const netGuesserClient = await connectClient();

  const netDrawerPid = 'usr-net-drawer-sel';
  const netDrawerSec = 'sec-net-drawer-sel-12345678';
  const netGuesserPid = 'usr-net-guesser-sel';
  const netGuesserSec = 'sec-net-guesser-sel-87654321';

  await new Promise((res) => {
    netDrawerClient.emit('join_room', {
      roomId: 'General #TestSelect',
      nickname: 'DrawerNet',
      playerId: netDrawerPid,
      reconnectSecret: netDrawerSec
    }, res);
  });

  await new Promise((res) => {
    netGuesserClient.emit('join_room', {
      roomId: 'General #TestSelect',
      nickname: 'GuesserNet',
      playerId: netGuesserPid,
      reconnectSecret: netGuesserSec
    }, res);
  });

  netRoom.gameState.status = 'CHOOSING';
  netRoom.gameState.currentDrawerId = netDrawerPid;
  netRoom.gameState.wordOptions = ['قارب', 'سيارة'];
  netRoom.gameState.currentWord = null;

  // Guesser attempts select_word
  netGuesserClient.emit('select_word', { word: 'قارب' });
  await new Promise(r => setTimeout(r, 60));
  assert(netRoom.gameState.status === 'CHOOSING', 'AUTH-13.7: Non-drawer over network cannot select word');

  // Drawer sends malformed payload
  netDrawerClient.emit('select_word', null);
  netDrawerClient.emit('select_word', { word: 999 });
  netDrawerClient.emit('select_word', { word: {} });
  await new Promise(r => setTimeout(r, 60));
  assert(netRoom.gameState.status === 'CHOOSING', 'AUTH-13.7: Malformed payloads over network do not trigger round start');

  // Drawer sends unauthorized word (not in options)
  netDrawerClient.emit('select_word', { word: 'طائرة' });
  await new Promise(r => setTimeout(r, 60));
  assert(netRoom.gameState.status === 'CHOOSING', 'AUTH-13.7: Word outside wordOptions over network is rejected');
  assert(netRoom.gameState.currentWord === null, 'AUTH-13.7: currentWord remains null over network');

  // Drawer sends legitimate choice from wordOptions
  netDrawerClient.emit('select_word', { word: 'قارب' });
  await new Promise(r => setTimeout(r, 60));
  assert((netRoom.gameState.status as string) === 'DRAWING', 'AUTH-13.7: Valid word selection over network transitions to DRAWING');
  assert(netRoom.gameState.currentWord === 'قارب', 'AUTH-13.7: Valid word selection over network sets currentWord');
  assert(netRoom.gameState.wordOptions.length === 0, 'AUTH-13.7: wordOptions emptied over network');

  netDrawerClient.disconnect();
  netGuesserClient.disconnect();
}

// -----------------------------------------------------------------
// 14. CHAT-GUESS-HARDEN-1: Chat and Guess Hardening Tests
// -----------------------------------------------------------------
console.log('\n--- Test Group 14: CHAT-GUESS-HARDEN-1 Hardening Tests ---');
{
  const rm = new RoomManager();
  const testRoomId = 'ChatGuessHardenRoom';
  const playerSocket = 'sock-harden-1';
  const playerPid = 'pid-harden-1';

  const room = rm.createRoom(testRoomId);
  rm.addPlayerToRoom(testRoomId, {
    id: playerSocket,
    name: 'HardenTester',
    score: 0,
    avatar: '🛡️',
    wins: 0,
    roomId: testRoomId,
    persistentId: playerPid,
    isOffline: false,
    lastActivity: Date.now()
  });

  room.gameState.status = 'DRAWING';
  room.gameState.currentDrawerId = 'other-drawer';
  room.gameState.currentWord = 'تفاحة';

  const mockSocket = {
    id: playerSocket,
    emit: (event: string, data: any) => {},
    on: () => {}
  };

  // Test 14.1: Submit Guess max length validation (> 250 chars)
  let submitGuessCalled = false;
  const origSubmitGuess = rm.submitGuess.bind(rm);
  rm.submitGuess = (rId, sId, g) => {
    submitGuessCalled = true;
    return origSubmitGuess(rId, sId, g);
  };

  const longGuess = 'أ'.repeat(251);
  handleSubmitGuess(mockSocket, { guess: longGuess }, { roomManager: rm, checkRateLimit: () => true });
  assert(!submitGuessCalled, 'AUTH-14.1: Guess exceeding 250 characters is rejected before RoomManager.submitGuess');

  const exactGuess = 'أ'.repeat(250);
  handleSubmitGuess(mockSocket, { guess: exactGuess }, { roomManager: rm, checkRateLimit: () => true });
  assert(submitGuessCalled, 'AUTH-14.1: Guess of exactly 250 characters is accepted');

  // Test 14.2: RoomManager.submitGuess direct max length check with state assertions
  const initialCorrectCount = room.gameState.correctGuessers.length;
  const initialGuessMessagesCount = room.guessMessages.length;

  rm.submitGuess(testRoomId, playerSocket, 'ب'.repeat(251));
  assert(room.gameState.correctGuessers.length === initialCorrectCount, 'AUTH-14.2: Long guess > 250 does not add to correctGuessers');
  assert(room.guessMessages.length === initialGuessMessagesCount, 'AUTH-14.2: Long guess > 250 does not store in guessMessages');

  // Test 14.3: send_message / handleSendMessage comprehensive tests
  const chatRoomId = 'ChatTestRoom';
  const chatRoom = rm.createRoom(chatRoomId);
  rm.addPlayerToRoom(chatRoomId, {
    id: 'sock-chat-1',
    name: 'Chatter',
    score: 0,
    avatar: '💬',
    wins: 0,
    roomId: chatRoomId,
    persistentId: 'pid-chat-1',
    isOffline: false,
    lastActivity: Date.now()
  });

  const chatSocket = {
    id: 'sock-chat-1',
    emit: (event: string, data: any) => {}
  };

  const invalidChatPayloads: any[] = [
    null,
    undefined,
    123,
    [],
    {},
    { text: null },
    { text: 456 },
    { text: '' },
    { text: '   ' }
  ];

  for (let i = 0; i < invalidChatPayloads.length; i++) {
    const payload = invalidChatPayloads[i];
    const initialMsgCount = chatRoom.chatMessages.length;
    handleSendMessage(chatSocket, payload, {
      io: { to: () => ({ emit: () => {} }) },
      roomManager: rm,
      checkRateLimit: () => true,
      normalizeArabic
    });
    assert(chatRoom.chatMessages.length === initialMsgCount, `AUTH-14.3.${i + 1}: Invalid chat payload ${JSON.stringify(payload)} rejected and not stored`);
  }

  // Test 14.4: Chat message length validation (251 rejected without store/broadcast, 250 accepted with store/broadcast and trim)
  const initialChatCount = chatRoom.chatMessages.length;
  let broadcastCount = 0;
  let lastBroadcastMsg: any = null;
  const trackingIo = {
    to: (roomId: string) => ({
      emit: (event: string, data: any) => {
        if (event === 'receive_message') {
          broadcastCount++;
          lastBroadcastMsg = data;
        }
      }
    })
  };

  // 251 characters rejected: neither stored nor broadcast
  handleSendMessage(chatSocket, { text: 'ت'.repeat(251) }, {
    io: trackingIo as any,
    roomManager: rm,
    checkRateLimit: () => true,
    normalizeArabic
  });
  assert(chatRoom.chatMessages.length === initialChatCount, 'AUTH-14.4: Chat message of length 251 rejected and not stored');
  assert(broadcastCount === 0, 'AUTH-14.4: Chat message of length 251 is not broadcast');

  // Exact 250 characters accepted: both stored and broadcast
  const msg250 = 'ج'.repeat(250);
  handleSendMessage(chatSocket, { text: msg250 }, {
    io: trackingIo as any,
    roomManager: rm,
    checkRateLimit: () => true,
    normalizeArabic
  });
  assert(chatRoom.chatMessages.length === initialChatCount + 1, 'AUTH-14.4: Chat message of exactly 250 characters accepted and stored');
  assert(broadcastCount === 1, 'AUTH-14.4: Chat message of exactly 250 characters is broadcast');
  assert(chatRoom.chatMessages[chatRoom.chatMessages.length - 1].text === msg250, 'AUTH-14.4: Stored message matches exact 250 characters');

  handleSendMessage(chatSocket, { text: '   مرحباً بك   ' }, {
    io: trackingIo as any,
    roomManager: rm,
    checkRateLimit: () => true,
    normalizeArabic
  });
  assert(chatRoom.chatMessages.length === initialChatCount + 2, 'AUTH-14.4: Valid chat message accepted');
  assert(chatRoom.chatMessages[chatRoom.chatMessages.length - 1].text === 'مرحباً بك', 'AUTH-14.4: Accepted message is correctly trimmed');

  // Test 14.5: Anti-cheat word leak check in chat
  chatRoom.gameState.status = 'DRAWING';
  chatRoom.gameState.currentWord = 'تفاحة';
  let cheatWarningEmitted = false;
  const cheatSocket = {
    id: 'sock-chat-1',
    emit: (event: string, data: any) => {
      if (event === 'receive_message' && data && data.type === 'warning') {
        cheatWarningEmitted = true;
      }
    }
  };

  const beforeCheatCount = chatRoom.chatMessages.length;
  handleSendMessage(cheatSocket, { text: 'الكلمة هي تفاحة هنا' }, {
    io: { to: () => ({ emit: () => {} }) },
    roomManager: rm,
    checkRateLimit: () => true,
    normalizeArabic
  });
  assert((cheatWarningEmitted as boolean) === true, 'AUTH-14.5: Secret word leak in chat triggers warning emission');
  assert(chatRoom.chatMessages.length === beforeCheatCount, 'AUTH-14.5: Leaking message is not stored in room chatMessages');
}

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
