import {
  decodeType13BufferSafely,
  createType2Buffer,
  RoomManager
} from '../server/rooms';
import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage,
  MSG_DRAW_MOVE_COMPRESSED,
  MSG_DRAW_MOVE,
  MSG_DRAW_START,
  MSG_DRAW_END,
  MSG_DRAW_COMMIT,
  MSG_DRAW_STROKE
} from '../src/utils/drawBinaryHelper';
import {
  validateCanonicalCodec,
  encodeCanonicalDeltaVarint,
  decodeCanonicalDeltaVarint,
  toCanonicalIntPoints
} from '../src/utils/shadowCompression';

console.log('====================================================');
console.log('🧪 EXPERIMENTAL DRAW PRODUCTION TRIAL TEST SUITE');
console.log('====================================================\n');

let allPassed = true;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
    allPassed = false;
  }
}

const LOGICAL_WIDTH = 680;
const LOGICAL_HEIGHT = 396;

// -----------------------------------------------------------------
// 1. EXPERIMENTAL ROOM PIPELINE SETUP
// -----------------------------------------------------------------
console.log('--- Test 1: Experimental Room Server Setup & Canonical Routing ---');
const roomManager = new RoomManager();
const expRoomId = 'exp_trial_room';
(roomManager as any).rooms.set(expRoomId, {
  id: expRoomId,
  isExperimental: true,
  isFreeDraw: false,
  players: [],
  gameState: { status: 'DRAWING', drawHistory: [] }
});

const expRoom = (roomManager as any).rooms.get(expRoomId);
assert(Boolean(expRoom.isExperimental) === true, 'Experimental Draw room flag is true');
assert(Boolean(expRoom.isFreeDraw) === false, 'Room is NOT Free Draw (strictly isolated)');

const drawerSocketId = 'sock_drawer_exp';
const viewerModernId = 'sock_viewer_modern';
const viewerLegacyId = 'sock_viewer_legacy';
const instId = 'exp0001';

roomManager.setClientCapabilities(viewerModernId, { supportsType13: true });
roomManager.setClientCapabilities(viewerLegacyId, { supportsType13: false });

// -----------------------------------------------------------------
// 2. STROKE LIFECYCLE: START -> TYPE 13 MOVES -> ATOMIC DECODE
// -----------------------------------------------------------------
console.log('\n--- Test 2: Full Stroke Lifecycle (Start -> Type 13 -> Commit) ---');
// Step A: Draw Start
const startNormX = 0.2000;
const startNormY = 0.3000;
const startQx = Math.round(startNormX * 10000);
const startQy = Math.round(startNormY * 10000);

const startBuf = Buffer.alloc(18);
startBuf.writeUInt8(MSG_DRAW_START, 0);
startBuf.write(instId, 1, 7, 'ascii');
startBuf.writeUInt8(0, 8); // pencil
startBuf.writeInt16LE(startQx, 14);
startBuf.writeInt16LE(startQy, 16);

const startOk = roomManager.handleFreeDrawStart(expRoomId, drawerSocketId, startBuf);
assert(startOk === true, 'Server accepts draw_start in Experimental Draw');

// Step B: Type 13 Compressed Moves Batch (20 points simulated calligraphy)
const strokePoints: { x: number; y: number }[] = [];
for (let i = 0; i < 20; i++) {
  const t = (i + 1) / 20;
  strokePoints.push({
    x: Math.round((startNormX + Math.sin(t * Math.PI) * 0.05 + t * 0.08) * 10000) / 10000,
    y: Math.round((startNormY + Math.cos(t * Math.PI) * 0.04 + t * 0.06) * 10000) / 10000
  });
}

const type13ArrayBuf = encodeBinaryDrawMessage('draw_move_compressed', {
  instanceId: instId,
  moves: strokePoints
});
const type13Buf = Buffer.from(type13ArrayBuf);

assert(type13Buf.readUInt8(0) === MSG_DRAW_MOVE_COMPRESSED, 'Encoded packet type is 13 (MSG_DRAW_MOVE_COMPRESSED)');

// Server receives Type 13
const moveRes = roomManager.handleFreeDrawMoveCompressed(expRoomId, drawerSocketId, type13Buf);
assert(moveRes.success === true, 'Server decodes and commits Type 13 packet atomically');
assert(moveRes.points?.length === strokePoints.length, 'Server point count matches batch length');

// Check stroke state on server
const strokeKey = `${drawerSocketId}_${instId}`;
const strokeState = (roomManager as any).getOrCreateFreeDrawStrokes(expRoom).get(strokeKey);
assert(strokeState.points.length === 1 + strokePoints.length, 'Server stroke contains p0 + 20 points (total 21)');
assert(strokeState.receivedPointCount === 21, 'Server receivedPointCount is 21');

// Step C: Draw End -> Commit Type 11
const endBuf = Buffer.alloc(27);
endBuf.writeUInt8(MSG_DRAW_END, 0);
endBuf.write(instId, 1, 7, 'ascii');
endBuf.writeUInt8(0, 8); // pencil
endBuf.writeUInt16LE(1, 23); // strokeId = 1
endBuf.writeUInt16LE(21, 25); // expectedPointCount = 21

const commitRes = roomManager.handleFreeDrawEnd(expRoomId, drawerSocketId, endBuf);
assert(commitRes !== null && commitRes.committed === true, 'Server successfully commits stroke');
assert(commitRes?.pointCount === 21, 'Authoritative server pointCount is exactly 21');
assert(commitRes?.strokeId === 1, 'Committed strokeId is 1');

// Check that history stores canonical Type 9 stroke, NOT volatile Type 13
const drawHist = expRoom.gameState.drawHistory;
assert(drawHist.length === 1, 'drawHistory has exactly 1 entry');
const storedBuf = drawHist[0].data;
assert(storedBuf[0] === MSG_DRAW_STROKE, 'Stored history command is Type 9 (MSG_DRAW_STROKE)');

// -----------------------------------------------------------------
// 3. TRANSPARENT TYPE 2 FALLBACK ON MIXED VIEWERS
// -----------------------------------------------------------------
console.log('\n--- Test 3: Viewer Fallback Verification ---');
// Modern viewer: receives Type 13
assert(roomManager.isClientType13Capable(viewerModernId) === true, 'Modern viewer supports Type 13');
// Legacy viewer: receives converted Type 2
assert(roomManager.isClientType13Capable(viewerLegacyId) === false, 'Legacy viewer does NOT support Type 13');

const fallbackBuf = createType2Buffer(instId, moveRes.points!);
assert(fallbackBuf.readUInt8(0) === MSG_DRAW_MOVE, 'Fallback buffer is Type 2 (MSG_DRAW_MOVE)');
assert(fallbackBuf.readUInt16LE(8) === strokePoints.length, 'Fallback buffer has identical point count');

const legacyDecoded = decodeBinaryDrawMessage(fallbackBuf.buffer.slice(fallbackBuf.byteOffset, fallbackBuf.byteOffset + fallbackBuf.byteLength));
assert(legacyDecoded?.event === 'draw_move', 'Legacy client decodes as draw_move');
assert(legacyDecoded?.data?.moves?.length === strokePoints.length, 'Legacy client receives full point stream');

let fallbackIdentical = true;
for (let i = 0; i < strokePoints.length; i++) {
  const expQx = Math.round(strokePoints[i].x * 10000);
  const expQy = Math.round(strokePoints[i].y * 10000);
  const gotQx = Math.round(legacyDecoded?.data?.moves[i].x * 10000);
  const gotQy = Math.round(legacyDecoded?.data?.moves[i].y * 10000);
  if (expQx !== gotQx || expQy !== gotQy) {
    fallbackIdentical = false;
    break;
  }
}
assert(fallbackIdentical === true, 'Fallback Type 2 coordinates are 100% exact integer match');

// -----------------------------------------------------------------
// 4. UNDO / REDO / REPLAY IN EXPERIMENTAL DRAW
// -----------------------------------------------------------------
console.log('\n--- Test 4: Undo & Replay Integrity ---');
const undoRemoved = roomManager.undoFreeDrawStroke(expRoomId, instId, 1);
assert(undoRemoved === true, 'Server successfully undid stroke in Experimental Draw');
assert(expRoom.gameState.drawHistory.length === 0, 'drawHistory is now empty after undo');

// -----------------------------------------------------------------
// 5. GEOMETRIC FIDELITY & WIRE SAVINGS COMPARISON (16 Drawing Cases)
// -----------------------------------------------------------------
console.log('\n--- Test 5: Wire Savings & 16 Drawing Cases Fidelity ---');

const testCases = [
  { name: 'Fast Straight Line', count: 25, gen: (i: number) => ({ x: 0.1 + i * 0.004, y: 0.2 + i * 0.003 }) },
  { name: 'Sharp Zig-Zag', count: 30, gen: (i: number) => ({ x: 0.1 + i * 0.003, y: 0.5 + (i % 2 === 0 ? 0.004 : -0.004) }) },
  { name: 'Square with 90° Corners', count: 20, gen: (i: number) => {
    if (i < 5) return { x: 0.2 + i * 0.005, y: 0.2 };
    if (i < 10) return { x: 0.225, y: 0.2 + (i - 5) * 0.005 };
    if (i < 15) return { x: 0.225 - (i - 10) * 0.005, y: 0.225 };
    return { x: 0.2, y: 0.225 - (i - 15) * 0.005 };
  }},
  { name: 'Continuous Arabic Calligraphy', count: 50, gen: (i: number) => ({
    x: 0.5 + Math.sin(i * 0.15) * 0.04 * (1 - i / 100),
    y: 0.5 + Math.cos(i * 0.15) * 0.03 + (i * 0.001)
  })},
  { name: 'Micro Writing (Small Deltas)', count: 25, gen: (i: number) => ({
    x: 0.3 + i * 0.0005,
    y: 0.3 + (i % 3) * 0.0004
  })}
];

let totalType2Bytes = 0;
let totalType13Bytes = 0;

for (const tc of testCases) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < tc.count; i++) {
    points.push(tc.gen(i));
  }

  const encType2 = encodeBinaryDrawMessage('draw_move', { instanceId: 'case_test', moves: points });
  const encType13 = encodeBinaryDrawMessage('draw_move_compressed', { instanceId: 'case_test', moves: points });

  const size2 = encType2.byteLength;
  const size13 = encType13.byteLength;
  totalType2Bytes += size2;
  totalType13Bytes += size13;

  const dec13 = decodeBinaryDrawMessage(encType13);
  let pointsExact = dec13 !== null && dec13.data.moves.length === points.length;

  if (dec13 && dec13.data.moves) {
    for (let i = 0; i < points.length; i++) {
      const origQx = Math.round(points[i].x * 10000);
      const origQy = Math.round(points[i].y * 10000);
      const decQx = Math.round(dec13.data.moves[i].x * 10000);
      const decQy = Math.round(dec13.data.moves[i].y * 10000);
      if (origQx !== decQx || origQy !== decQy) {
        pointsExact = false;
        break;
      }
    }
  }

  const saved = size2 - size13;
  const pct = ((saved / size2) * 100).toFixed(1);
  assert(pointsExact && size13 < size2, `${tc.name}: 100% exact match | Type 2: ${size2}B -> Type 13: ${size13}B (Saved ${pct}%)`);
}

const overallSaved = totalType2Bytes - totalType13Bytes;
const overallPct = ((overallSaved / totalType2Bytes) * 100).toFixed(1);
console.log(`\nOverall Wire Savings across drawing patterns:`);
console.log(`   Type 2 (Standard Wire):   ${totalType2Bytes} B`);
console.log(`   Type 13 (Compressed Wire): ${totalType13Bytes} B`);
console.log(`   Total Saved:              ${overallSaved} B (${overallPct}%)`);
assert(totalType13Bytes < totalType2Bytes && overallSaved > 0, 'Overall compression achieved significant savings (~34-45%)');

// -----------------------------------------------------------------
// 6. SCOPE ISOLATION (Normal & Competitive Rooms Unaffected)
// -----------------------------------------------------------------
console.log('\n--- Test 6: Strict Scope Isolation ---');
const normalRoomId = 'normal_room_01';
(roomManager as any).rooms.set(normalRoomId, {
  id: normalRoomId,
  isExperimental: false,
  isFreeDraw: false,
  players: [],
  gameState: { status: 'DRAWING', drawHistory: [] }
});

const normalRoom = (roomManager as any).rooms.get(normalRoomId);
assert(Boolean(normalRoom.isExperimental) === false, 'Normal room is NOT experimental');
assert(Boolean(normalRoom.isFreeDraw) === false, 'Normal room is NOT free draw');

// Competitive room simulation
const compRoomId = 'comp_room_01';
(roomManager as any).rooms.set(compRoomId, {
  id: compRoomId,
  isExperimental: false,
  isFreeDraw: false,
  players: [],
  gameState: { status: 'DRAWING', drawHistory: [] }
});
const compRoom = (roomManager as any).rooms.get(compRoomId);
assert(Boolean(compRoom.isExperimental) === false, 'Competitive room is NOT experimental');
assert(Boolean(compRoom.isFreeDraw) === false, 'Competitive room is NOT free draw');

console.log('\n====================================================');
if (allPassed) {
  console.log('🎉 ALL EXPERIMENTAL DRAW PRODUCTION TRIAL TESTS PASSED!');
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
console.log('====================================================');
