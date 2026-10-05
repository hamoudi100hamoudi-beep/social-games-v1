import {
  decodeType13BufferSafely,
  createType2Buffer,
  RoomManager
} from '../server/rooms';
import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage,
  MSG_DRAW_MOVE_COMPRESSED,
  MSG_DRAW_MOVE
} from '../src/utils/drawBinaryHelper';
import {
  encodeZigZag,
  writeVarInt
} from '../src/utils/shadowCompression';

console.log('====================================================');
console.log('🛡️  TYPE 13 PRODUCTION HARDENING AUTOMATED TESTS');
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

// -----------------------------------------------------------------
// 1. VALID PACKET (Happy Path)
// -----------------------------------------------------------------
console.log('--- Test 1: Valid Packet (Happy Path) ---');
const validBatch = [
  { x: 0.1234, y: 0.5678 },
  { x: 0.1245, y: 0.5690 },
  { x: 0.1260, y: 0.5710 }
];
const validArrayBuf = encodeBinaryDrawMessage('draw_move_compressed', {
  instanceId: 'inst001',
  moves: validBatch
});
const validBuf = Buffer.from(validArrayBuf);

const serverValidDec = decodeType13BufferSafely(validBuf);
assert(serverValidDec.success === true, 'Server accepts valid Type 13 packet');
assert(serverValidDec.points?.length === validBatch.length, 'Server decodes exact point count');
assert(
  serverValidDec.points?.[0].x === Math.round(validBatch[0].x * 10000) &&
  serverValidDec.points?.[0].y === Math.round(validBatch[0].y * 10000),
  'Server decodes exact integer coordinates'
);

const clientValidDec = decodeBinaryDrawMessage(validArrayBuf);
assert(clientValidDec !== null, 'Client accepts valid Type 13 packet');
assert(clientValidDec?.event === 'draw_move', 'Client returns draw_move event');
assert(clientValidDec?.data?.moves?.length === validBatch.length, 'Client decodes exact point count');
assert(
  Math.round(clientValidDec?.data?.moves?.[0].x * 10000) === Math.round(validBatch[0].x * 10000),
  'Client decodes exact coordinates'
);

// -----------------------------------------------------------------
// 2. MALFORMED VARINT REJECTION (Overflow)
// -----------------------------------------------------------------
console.log('\n--- Test 2: Malformed VarInt (Overflow) ---');
// Construct a buffer where VarInt shift exceeds 28 bits (6 bytes with 0xFF)
const overflowBuf = Buffer.alloc(18);
overflowBuf.writeUInt8(13, 0); // Type 13
overflowBuf.write('inst001', 1, 7, 'ascii');
overflowBuf.writeUInt16LE(1, 8); // count = 1 point
// Write 6 consecutive bytes with 0xFF (VarInt overflow)
for (let i = 10; i < 16; i++) {
  overflowBuf.writeUInt8(0xff, i);
}
overflowBuf.writeUInt8(0x00, 16);
overflowBuf.writeUInt8(0x00, 17);

const serverOverflowDec = decodeType13BufferSafely(overflowBuf);
assert(serverOverflowDec.success === false, 'Server rejects VarInt overflow');
assert(serverOverflowDec.error?.includes('VarInt overflow') === true, 'Server reports VarInt overflow error');

const clientOverflowDec = decodeBinaryDrawMessage(overflowBuf.buffer.slice(overflowBuf.byteOffset, overflowBuf.byteOffset + overflowBuf.byteLength));
assert(clientOverflowDec === null, 'Client rejects VarInt overflow and returns null');

// -----------------------------------------------------------------
// 3. TRUNCATED PACKET REJECTION
// -----------------------------------------------------------------
console.log('\n--- Test 3: Truncated Packet Rejection ---');
// Header says count = 3, but buffer is truncated right after 1st point
const truncatedBuf = Buffer.from(validBuf.subarray(0, 14)); // cuts off points 2 & 3
const serverTruncDec = decodeType13BufferSafely(truncatedBuf);
assert(serverTruncDec.success === false, 'Server rejects truncated packet');

const clientTruncDec = decodeBinaryDrawMessage(truncatedBuf.buffer.slice(truncatedBuf.byteOffset, truncatedBuf.byteOffset + truncatedBuf.byteLength));
assert(clientTruncDec === null, 'Client rejects truncated packet and returns null (NEVER partial moves)');

// -----------------------------------------------------------------
// 4. UNEXPECTED TRAILING BYTES REJECTION
// -----------------------------------------------------------------
console.log('\n--- Test 4: Unexpected Trailing Bytes Rejection ---');
// Valid buffer with 4 extra garbage bytes at the end
const trailingBuf = Buffer.concat([validBuf, Buffer.from([0xDE, 0xAD, 0xBE, 0xEF])]);
const serverTrailingDec = decodeType13BufferSafely(trailingBuf);
assert(serverTrailingDec.success === false, 'Server rejects packet with unexpected trailing bytes');
assert(serverTrailingDec.error === 'unexpected_trailing_bytes', 'Server identifies trailing bytes error');

const clientTrailingDec = decodeBinaryDrawMessage(trailingBuf.buffer.slice(trailingBuf.byteOffset, trailingBuf.byteOffset + trailingBuf.byteLength));
assert(clientTrailingDec === null, 'Client rejects packet with trailing bytes and returns null');

// -----------------------------------------------------------------
// 5. POINT COUNT MISMATCH REJECTION
// -----------------------------------------------------------------
console.log('\n--- Test 5: Point Count Mismatch Rejection ---');
// Valid buffer but overwrite count header with 10 (when only 3 exist)
const mismatchBuf = Buffer.from(validBuf);
mismatchBuf.writeUInt16LE(10, 8); // count = 10
const serverMismatchDec = decodeType13BufferSafely(mismatchBuf);
assert(serverMismatchDec.success === false, 'Server rejects count mismatch');

const clientMismatchDec = decodeBinaryDrawMessage(mismatchBuf.buffer.slice(mismatchBuf.byteOffset, mismatchBuf.byteOffset + mismatchBuf.byteLength));
assert(clientMismatchDec === null, 'Client rejects count mismatch and returns null');

// -----------------------------------------------------------------
// 6. OUT-OF-BOUNDS COORDINATES REJECTION
// -----------------------------------------------------------------
console.log('\n--- Test 6: Out-of-bounds Coordinates Rejection ---');
// Point exceeding Int16 bounds (e.g. 50,000)
const outOfBoundsPayload: number[] = [];
writeVarInt(outOfBoundsPayload, encodeZigZag(50000)); // qx > 32767
writeVarInt(outOfBoundsPayload, encodeZigZag(1000));
const oobBuf = Buffer.alloc(10 + outOfBoundsPayload.length);
oobBuf.writeUInt8(13, 0);
oobBuf.write('inst001', 1, 7, 'ascii');
oobBuf.writeUInt16LE(1, 8); // count = 1
for (let i = 0; i < outOfBoundsPayload.length; i++) {
  oobBuf.writeUInt8(outOfBoundsPayload[i], 10 + i);
}

const serverOobDec = decodeType13BufferSafely(oobBuf);
assert(serverOobDec.success === false, 'Server rejects out-of-bounds coordinate');
assert(serverOobDec.error === 'coordinates_out_of_bounds', 'Server identifies coordinates_out_of_bounds error');

const clientOobDec = decodeBinaryDrawMessage(oobBuf.buffer.slice(oobBuf.byteOffset, oobBuf.byteOffset + oobBuf.byteLength));
assert(clientOobDec === null, 'Client rejects out-of-bounds coordinate and returns null');

// -----------------------------------------------------------------
// 7. ATOMIC SERVER DECODE (Zero Partial Points Left Behind)
// -----------------------------------------------------------------
console.log('\n--- Test 7: Atomic Server Decode (Zero Partial State Leaked) ---');
const roomManager = new RoomManager();
const roomId = 'test_hardening_room';
// Setup dummy free draw room
(roomManager as any).rooms.set(roomId, {
  id: roomId,
  isFreeDraw: true,
  players: [],
  gameState: { status: 'DRAWING' }
});

const socketId = 'sock_tester';
const instId = 'inst999';

// 1. Start a stroke (p0)
const startBuf = Buffer.alloc(18);
startBuf.writeUInt8(1, 0); // MSG_DRAW_START
startBuf.write(instId, 1, 7, 'ascii');
startBuf.writeUInt8(0, 8); // pencil
startBuf.writeInt16LE(1000, 14); // startX = 1000
startBuf.writeInt16LE(2000, 16); // startY = 2000
roomManager.handleFreeDrawStart(roomId, socketId, startBuf);

const strokeKey = `${socketId}_${instId}`;
const strokeBefore = (roomManager as any).getOrCreateFreeDrawStrokes((roomManager as any).rooms.get(roomId)).get(strokeKey);
assert(strokeBefore !== undefined, 'Stroke created in RoomManager');
assert(strokeBefore.points.length === 1, 'Initial stroke has exactly 1 point (p0)');
assert(strokeBefore.receivedPointCount === 1, 'Initial receivedPointCount is 1');

// 2. Send corrupted packet (2 valid points followed by truncated stream)
const partialBatch = [
  { x: 0.1500, y: 0.2500 },
  { x: 0.1510, y: 0.2510 }
];
const partialArrayBuf = encodeBinaryDrawMessage('draw_move_compressed', {
  instanceId: instId,
  moves: partialBatch
});
// Corrupt the packet: set count = 5 but payload only has 2 points
const corruptPartialBuf = Buffer.from(partialArrayBuf);
corruptPartialBuf.writeUInt16LE(5, 8);

const moveResult = roomManager.handleFreeDrawMoveCompressed(roomId, socketId, corruptPartialBuf);
assert(moveResult.success === false, 'handleFreeDrawMoveCompressed rejected corrupt packet');

// 3. Verify stroke state was NOT mutated
const strokeAfter = (roomManager as any).getOrCreateFreeDrawStrokes((roomManager as any).rooms.get(roomId)).get(strokeKey);
assert(strokeAfter.points.length === 1, 'ATOMICITY PASS: stroke.points length is still exactly 1 (no partial points appended)');
assert(strokeAfter.receivedPointCount === 1, 'ATOMICITY PASS: receivedPointCount is still exactly 1');

// 4. Now send a 100% valid packet and ensure it commits cleanly
const legitBatch = [
  { x: 0.1500, y: 0.2500 },
  { x: 0.1510, y: 0.2510 }
];
const legitArrayBuf = encodeBinaryDrawMessage('draw_move_compressed', {
  instanceId: instId,
  moves: legitBatch
});
const legitMoveResult = roomManager.handleFreeDrawMoveCompressed(roomId, socketId, Buffer.from(legitArrayBuf));
assert(legitMoveResult.success === true, 'handleFreeDrawMoveCompressed accepts subsequent valid packet');
assert(strokeAfter.points.length === 3, 'stroke.points now has exactly 3 points (p0 + 2 moves)');
assert(strokeAfter.receivedPointCount === 3, 'receivedPointCount is now 3');

// -----------------------------------------------------------------
// 8. COMPATIBILITY & FALLBACK (Type 2 on Legacy Clients)
// -----------------------------------------------------------------
console.log('\n--- Test 8: Compatibility & Type 2 Fallback ---');
const modernSocketId = 'sock_modern';
const legacySocketId = 'sock_legacy';

roomManager.setClientCapabilities(modernSocketId, { supportsType13: true });
roomManager.setClientCapabilities(legacySocketId, { supportsType13: false });

assert(roomManager.isClientType13Capable(modernSocketId) === true, 'Modern client capability detected');
assert(roomManager.isClientType13Capable(legacySocketId) === false, 'Legacy client capability detected (not capable)');

// Test createType2Buffer fallback conversion
const canonicalPoints = [
  { x: 1234, y: 5678 },
  { x: 1245, y: 5690 },
  { x: 1260, y: 5710 }
];
const fallbackType2Buf = createType2Buffer('inst777', canonicalPoints);
assert(fallbackType2Buf.readUInt8(0) === MSG_DRAW_MOVE, 'Fallback buffer type is MSG_DRAW_MOVE (Type 2)');
assert(fallbackType2Buf.readUInt16LE(8) === canonicalPoints.length, 'Fallback buffer count matches canonical count');

// Decode using standard client decoder
const legacyDecoded = decodeBinaryDrawMessage(
  fallbackType2Buf.buffer.slice(fallbackType2Buf.byteOffset, fallbackType2Buf.byteOffset + fallbackType2Buf.byteLength)
);
assert(legacyDecoded !== null, 'Client decodes fallback Type 2 packet');
assert(legacyDecoded?.event === 'draw_move', 'Event is draw_move');
assert(legacyDecoded?.data?.moves?.length === canonicalPoints.length, 'Decoded moves count matches');

let fallbackPointsMatch = true;
for (let i = 0; i < canonicalPoints.length; i++) {
  const expX = canonicalPoints[i].x;
  const expY = canonicalPoints[i].y;
  const gotX = Math.round(legacyDecoded?.data?.moves[i].x * 10000);
  const gotY = Math.round(legacyDecoded?.data?.moves[i].y * 10000);
  if (expX !== gotX || expY !== gotY) {
    fallbackPointsMatch = false;
    break;
  }
}
assert(fallbackPointsMatch, 'Fallback Type 2 packet contains 100% exact canonical coordinates');

console.log('\n====================================================');
if (allPassed) {
  console.log('🎉 ALL TYPE 13 PRODUCTION HARDENING TESTS PASSED!');
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
console.log('====================================================');
