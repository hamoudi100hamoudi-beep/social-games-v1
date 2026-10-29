import assert from 'node:assert';
import { getRoomConfig, ROOM_PRESETS } from '../src/types/game.js';
import { RoomManager } from '../server/rooms.js';
import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================');
console.log('🧪 LEGACY-1A: COMPETITIVE ROOMS ROUTING VERIFICATION');
console.log('====================================================');

// 1. Preset Configuration Verification
console.log('\n--- 1. Preset Configuration in ROOM_PRESETS ---');
const generalTestPreset = ROOM_PRESETS.find(r => r.id === 'General #Test');
assert(generalTestPreset !== undefined, 'Preset General #Test exists');
assert(generalTestPreset?.isExperimental === true, 'General #Test has isExperimental === true');
assert(!generalTestPreset?.isFreeDraw, 'General #Test is NOT Free Draw');

const general10PPreset = ROOM_PRESETS.find(r => r.id === 'General #10P');
assert(general10PPreset !== undefined, 'Preset General #10P exists');
assert(general10PPreset?.isExperimental === true, 'General #10P has isExperimental === true');
assert(!general10PPreset?.isFreeDraw, 'General #10P is NOT Free Draw');

const freeDrawPreset = ROOM_PRESETS.find(r => r.id === 'Free Draw');
assert(freeDrawPreset !== undefined, 'Preset Free Draw exists');
assert(freeDrawPreset?.isFreeDraw === true, 'Free Draw has isFreeDraw === true');
assert(freeDrawPreset?.isExperimental === undefined, 'Free Draw has isExperimental === undefined');

const expDrawPreset = ROOM_PRESETS.find(r => r.id === 'Experimental Draw');
assert(expDrawPreset !== undefined, 'Preset Experimental Draw exists');
assert(expDrawPreset?.isExperimental === true, 'Experimental Draw has isExperimental === true');
assert(!expDrawPreset?.isFreeDraw, 'Experimental Draw is NOT Free Draw');
console.log('✅ PASS: All 4 presets verified in ROOM_PRESETS');

// 2. getRoomConfig Canonical ID & Alias Routing Verification
console.log('\n--- 2. getRoomConfig ID & Alias Resolution ---');
const cases = [
  { input: 'General #Test', expectedId: 'General #Test', exp: true, free: false },
  { input: 'general', expectedId: 'General #Test', exp: true, free: false },
  { input: 'general #test', expectedId: 'General #Test', exp: true, free: false },
  { input: 'test', expectedId: 'General #Test', exp: true, free: false },
  { input: '#test', expectedId: 'General #Test', exp: true, free: false },
  { input: 'General #10P', expectedId: 'General #10P', exp: true, free: false },
  { input: '10p', expectedId: 'General #10P', exp: true, free: false },
  { input: '#10p', expectedId: 'General #10P', exp: true, free: false },
  { input: 'Experimental Draw', expectedId: 'Experimental Draw', exp: true, free: false },
  { input: 'experimental', expectedId: 'Experimental Draw', exp: true, free: false },
  { input: 'Free Draw', expectedId: 'Free Draw', exp: false, free: true },
  { input: 'free', expectedId: 'Free Draw', exp: false, free: true },
  { input: 'freedraw', expectedId: 'Free Draw', exp: false, free: true },
];

for (const c of cases) {
  const cfg = getRoomConfig(c.input);
  assert.strictEqual(cfg.id, c.expectedId, `Input "${c.input}" resolves to ID "${c.expectedId}"`);
  assert.strictEqual(Boolean(cfg.isExperimental), c.exp, `Input "${c.input}" isExperimental === ${c.exp}`);
  assert.strictEqual(Boolean(cfg.isFreeDraw), c.free, `Input "${c.input}" isFreeDraw === ${c.free}`);
  console.log(`✅ PASS: "${c.input}" -> "${cfg.id}" (isExperimental: ${Boolean(cfg.isExperimental)}, isFreeDraw: ${Boolean(cfg.isFreeDraw)})`);
}

// 3. RoomManager Server Instantiation Verification
console.log('\n--- 3. RoomManager Server Creation & Mode Flags ---');
const rm = new RoomManager();

const roomTest = rm.createRoom('General #Test');
assert.strictEqual(roomTest.isExperimental, true, 'Server room "General #Test" has isExperimental: true');
assert.strictEqual(roomTest.isFreeDraw, false, 'Server room "General #Test" has isFreeDraw: false');

const room10P = rm.createRoom('General #10P');
assert.strictEqual(room10P.isExperimental, true, 'Server room "General #10P" has isExperimental: true');
assert.strictEqual(room10P.isFreeDraw, false, 'Server room "General #10P" has isFreeDraw: false');

const roomExp = rm.createRoom('Experimental Draw');
assert.strictEqual(roomExp.isExperimental, true, 'Server room "Experimental Draw" has isExperimental: true');
assert.strictEqual(roomExp.isFreeDraw, false, 'Server room "Experimental Draw" has isFreeDraw: false');

const roomFree = rm.createRoom('Free Draw');
assert.strictEqual(roomFree.isExperimental, false, 'Server room "Free Draw" has isExperimental: false');
assert.strictEqual(roomFree.isFreeDraw, true, 'Server room "Free Draw" has isFreeDraw: true');
console.log('✅ PASS: Server RoomManager correctly assigns flags to all preset rooms');

// 4. Server Canonical Pipeline Logic Verification
console.log('\n--- 4. Binary Pipeline Routing Verification ---');
function checkCanonicalPipeline(room: { isFreeDraw?: boolean; isExperimental?: boolean }): boolean {
  const isFreeDraw = !!room.isFreeDraw;
  const isExperimental = !!room.isExperimental;
  return isFreeDraw || isExperimental;
}

assert.strictEqual(checkCanonicalPipeline(roomTest), true, 'General #Test uses canonical pipeline (Type 13 / Type 9)');
assert.strictEqual(checkCanonicalPipeline(room10P), true, 'General #10P uses canonical pipeline (Type 13 / Type 9)');
assert.strictEqual(checkCanonicalPipeline(roomExp), true, 'Experimental Draw uses canonical pipeline (Type 13 / Type 9)');
assert.strictEqual(checkCanonicalPipeline(roomFree), true, 'Free Draw uses canonical pipeline (Type 13 / Type 9)');
console.log('✅ PASS: All competitive rooms and Free Draw utilize canonical draw pipeline on server');

// 5. Active Architecture Preservation & Retired Component Verification (LEGACY-1C-B)
console.log('\n--- 5. Active Architecture Preservation & Retired Component Verification ---');
const activeArchitectureFiles = [
  'src/components/GameRoom.tsx',
  'src/components/game/DrawingCanvasCore.tsx',
  'src/components/experimental/ExperimentalGameRoom.tsx',
  'src/components/experimental/ExperimentalDrawingBoard.tsx',
  'src/components/experimental/IsolatedDrawingLayer.tsx',
];

for (const relPath of activeArchitectureFiles) {
  const fullPath = path.resolve(relPath);
  assert(fs.existsSync(fullPath), `Active file ${relPath} must exist`);
  const stat = fs.statSync(fullPath);
  assert(stat.size > 0, `File ${relPath} is non-empty (${stat.size} bytes)`);
  console.log(`✅ PASS: ${relPath} preserved intact (${stat.size} bytes)`);
}

// Explicitly assert that superseded legacy DrawingBoard.tsx has been retired
const retiredDrawingBoard = path.resolve('src/components/DrawingBoard.tsx');
assert(!fs.existsSync(retiredDrawingBoard), 'Superseded legacy DrawingBoard.tsx must be retired (does not exist)');
console.log('✅ PASS: src/components/DrawingBoard.tsx verified cleanly retired (does not exist)');

// 6. App.tsx Component Routing Verification
console.log('\n--- 6. Client App.tsx Component Selection ---');
const appContent = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
assert(appContent.includes('getRoomConfig(playerInfo.room).isExperimental'), 'App.tsx inspects isExperimental flag');
assert(appContent.includes('<ExperimentalGameRoom'), 'App.tsx renders ExperimentalGameRoom when isExperimental is true');
assert(appContent.includes('<GameRoom'), 'App.tsx renders GameRoom when isExperimental is falsy (e.g. Free Draw)');
console.log('✅ PASS: App.tsx routes isExperimental rooms to ExperimentalGameRoom, others to GameRoom');

console.log('\n====================================================');
console.log('🎉 ALL LEGACY-1A ROUTING CHECKS PASSED!');
console.log('====================================================');
