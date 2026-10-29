import assert from 'node:assert';
import { getRoomConfig, ROOM_PRESETS } from '../src/types/game.js';
import { RoomManager } from '../server/rooms.js';

console.log('====================================================');
console.log('🧪 LEGACY-1C-A: CANONICAL ROUTING FOR UNKNOWN ROOMS');
console.log('====================================================');

// 1. Unknown Room Routing & Attribute Invariants
console.log('\n--- 1. Unknown Room Config Resolution & Invariants ---');
const unknownRoomId = 'legacy-custom-room-001';
const unknownConfig = getRoomConfig(unknownRoomId);

assert.strictEqual(unknownConfig.id, unknownRoomId, 'Unknown room id matches input');
assert.strictEqual(unknownConfig.name, unknownRoomId, 'Unknown room name matches input');
assert.strictEqual(unknownConfig.tag, '#Custom', 'Unknown room tag is #Custom');
assert.strictEqual(unknownConfig.theme, 'General', 'Unknown room theme is General');
assert.strictEqual(unknownConfig.maxPlayers, 5, 'Unknown room maxPlayers is 5');
assert.strictEqual(unknownConfig.winningScore, 30, 'Unknown room winningScore is 30');
assert.strictEqual(unknownConfig.isExperimental, true, 'Unknown room has isExperimental: true');
assert.strictEqual(unknownConfig.isFreeDraw, undefined, 'Unknown room isFreeDraw is undefined');
console.log('✅ PASS: Unknown room "legacy-custom-room-001" retains all attributes with isExperimental: true');

// Additional unknown room examples
const otherUnknowns = ['custom_room_xyz', 'my-private-game-999', 'arbitrary-room-name'];
for (const id of otherUnknowns) {
  const cfg = getRoomConfig(id);
  assert.strictEqual(cfg.id, id, `Config id matches "${id}"`);
  assert.strictEqual(cfg.isExperimental, true, `Config for "${id}" has isExperimental === true`);
  assert.strictEqual(Boolean(cfg.isFreeDraw), false, `Config for "${id}" has isFreeDraw === false`);
}
console.log('✅ PASS: Additional unknown room IDs resolve cleanly with isExperimental: true');

// 2. RoomManager Server Instantiation of Unknown Rooms
console.log('\n--- 2. RoomManager Server Creation for Unknown Room ---');
const roomManager = new RoomManager();
const serverRoom = roomManager.createRoom(unknownRoomId);

assert.strictEqual(serverRoom.id, unknownRoomId, 'Server room id matches input');
assert.strictEqual(serverRoom.isExperimental, true, 'Server room sets isExperimental: true');
assert.strictEqual(serverRoom.isFreeDraw, false, 'Server room sets isFreeDraw: false');
assert.strictEqual(serverRoom.maxPlayers, 5, 'Server room maxPlayers is 5');
assert.strictEqual(serverRoom.winningScore, 30, 'Server room winningScore is 30');
assert.strictEqual(serverRoom.gameState.status, 'WAITING', 'Server room gameState status starts at WAITING');
console.log('✅ PASS: Server RoomManager correctly creates unknown room with isExperimental: true and isFreeDraw: false');

// 3. Free Draw Invariant & Aliases Preservation
console.log('\n--- 3. Free Draw Preset & Alias Invariant Verification ---');
const freeDrawAliases = [
  'Free Draw',
  'free',
  '#free',
  'freedraw',
  'my-free-board',
  'غرفة رسم حر',
  'رسم حر',
];

for (const alias of freeDrawAliases) {
  const cfg = getRoomConfig(alias);
  assert.strictEqual(cfg.id, 'Free Draw', `Alias "${alias}" maps to Free Draw`);
  assert.strictEqual(cfg.isFreeDraw, true, `Alias "${alias}" has isFreeDraw === true`);
  assert.strictEqual(cfg.isExperimental, undefined, `Alias "${alias}" has isExperimental === undefined`);
  console.log(`✅ PASS: Free Draw alias "${alias}" -> isFreeDraw: true, isExperimental: undefined`);
}

const serverFreeRoom = roomManager.createRoom('Free Draw');
assert.strictEqual(serverFreeRoom.isFreeDraw, true, 'Server Free Draw room has isFreeDraw: true');
assert.strictEqual(serverFreeRoom.isExperimental, false, 'Server Free Draw room has isExperimental: false');
assert.strictEqual(serverFreeRoom.gameState.status, 'DRAWING', 'Server Free Draw room starts at DRAWING');
console.log('✅ PASS: Server RoomManager preserves Free Draw invariants');

// 4. Verification of All ROOM_PRESETS Elements
console.log('\n--- 4. Verification of ROOM_PRESETS Invariants ---');
assert.strictEqual(ROOM_PRESETS.length, 4, 'ROOM_PRESETS contains exactly 4 entries');

const p0 = ROOM_PRESETS[0];
assert.strictEqual(p0.id, 'General #Test', 'Preset 0 is General #Test');
assert.strictEqual(p0.isExperimental, true, 'Preset 0 has isExperimental: true');
assert.strictEqual(p0.isFreeDraw, undefined, 'Preset 0 isFreeDraw is undefined');
assert.strictEqual(p0.maxPlayers, 5, 'Preset 0 maxPlayers is 5');
assert.strictEqual(p0.winningScore, 30, 'Preset 0 winningScore is 30');

const p1 = ROOM_PRESETS[1];
assert.strictEqual(p1.id, 'General #10P', 'Preset 1 is General #10P');
assert.strictEqual(p1.isExperimental, true, 'Preset 1 has isExperimental: true');
assert.strictEqual(p1.isFreeDraw, undefined, 'Preset 1 isFreeDraw is undefined');
assert.strictEqual(p1.maxPlayers, 10, 'Preset 1 maxPlayers is 10');
assert.strictEqual(p1.winningScore, 120, 'Preset 1 winningScore is 120');

const p2 = ROOM_PRESETS[2];
assert.strictEqual(p2.id, 'Free Draw', 'Preset 2 is Free Draw');
assert.strictEqual(p2.isFreeDraw, true, 'Preset 2 has isFreeDraw: true');
assert.strictEqual(p2.isExperimental, undefined, 'Preset 2 isExperimental is undefined');
assert.strictEqual(p2.maxPlayers, 5, 'Preset 2 maxPlayers is 5');
assert.strictEqual(p2.winningScore, 0, 'Preset 2 winningScore is 0');

const p3 = ROOM_PRESETS[3];
assert.strictEqual(p3.id, 'Experimental Draw', 'Preset 3 is Experimental Draw');
assert.strictEqual(p3.isExperimental, true, 'Preset 3 has isExperimental: true');
assert.strictEqual(p3.isFreeDraw, undefined, 'Preset 3 isFreeDraw is undefined');
assert.strictEqual(p3.maxPlayers, 5, 'Preset 3 maxPlayers is 5');
assert.strictEqual(p3.winningScore, 30, 'Preset 3 winningScore is 30');
console.log('✅ PASS: All 4 presets in ROOM_PRESETS preserved identically');

// 5. Historical Aliases Resolution
console.log('\n--- 5. Historical Aliases Resolution Verification ---');
const aliasTests = [
  { alias: 'general', expectedId: 'General #Test', exp: true, free: false },
  { alias: 'general #test', expectedId: 'General #Test', exp: true, free: false },
  { alias: 'test', expectedId: 'General #Test', exp: true, free: false },
  { alias: '#test', expectedId: 'General #Test', exp: true, free: false },
  { alias: '10p', expectedId: 'General #10P', exp: true, free: false },
  { alias: '#10p', expectedId: 'General #10P', exp: true, free: false },
  { alias: 'p10', expectedId: 'General #10P', exp: true, free: false },
  { alias: '#p10', expectedId: 'General #10P', exp: true, free: false },
  { alias: 'experimental', expectedId: 'Experimental Draw', exp: true, free: false },
  { alias: 'experimental draw', expectedId: 'Experimental Draw', exp: true, free: false },
  { alias: '🧪', expectedId: 'Experimental Draw', exp: true, free: false },
];

for (const t of aliasTests) {
  const cfg = getRoomConfig(t.alias);
  assert.strictEqual(cfg.id, t.expectedId, `Alias "${t.alias}" maps to ${t.expectedId}`);
  assert.strictEqual(Boolean(cfg.isExperimental), t.exp, `Alias "${t.alias}" isExperimental is ${t.exp}`);
  assert.strictEqual(Boolean(cfg.isFreeDraw), t.free, `Alias "${t.alias}" isFreeDraw is ${t.free}`);
}
console.log('✅ PASS: All historical competitive aliases map correctly with isExperimental: true');

console.log('\n====================================================');
console.log('🎉 ALL LEGACY-1C-A UNKNOWN ROOM ROUTING CHECKS PASSED!');
console.log('====================================================');
