import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage,
  MSG_DRAW_MOVE_COMPRESSED,
  MSG_DRAW_MOVE
} from '../src/utils/drawBinaryHelper';
import {
  encodeZigZag,
  decodeZigZag,
  readVarInt
} from '../src/utils/shadowCompression';

console.log('====================================================');
console.log('🧪 TESTING EXPERIMENTAL COMPRESSED DRAW TRANSPORT (TYPE 13)');
console.log('====================================================\n');

let allPassed = true;

// Helper: simulate server decoder
function serverDecodeCompressedMove(buf: Buffer): { instId: string; points: { x: number; y: number }[] } {
  if (buf[0] !== 13) throw new Error('Not Type 13');
  let instId = '';
  for (let i = 0; i < 7; i++) {
    const c = buf[1 + i];
    if (c > 0) instId += String.fromCharCode(c);
  }
  const count = buf.readUInt16LE(8);
  const points: { x: number; y: number }[] = [];
  const cursor = { offset: 10 };
  let prevQx = 0;
  let prevQy = 0;

  for (let i = 0; i < count; i++) {
    // Read VarInt
    let zzX = 0, shiftX = 0;
    while (cursor.offset < buf.length) {
      const b = buf[cursor.offset++];
      zzX |= (b & 0x7f) << shiftX;
      if ((b & 0x80) === 0) break;
      shiftX += 7;
    }
    let zzY = 0, shiftY = 0;
    while (cursor.offset < buf.length) {
      const b = buf[cursor.offset++];
      zzY |= (b & 0x7f) << shiftY;
      if ((b & 0x80) === 0) break;
      shiftY += 7;
    }
    const valX = decodeZigZag(zzX);
    const valY = decodeZigZag(zzY);

    if (i === 0) {
      prevQx = valX;
      prevQy = valY;
    } else {
      prevQx = (prevQx + valX) | 0;
      prevQy = (prevQy + valY) | 0;
    }
    points.push({ x: prevQx, y: prevQy });
  }
  return { instId, points };
}

// 1. Basic Stroke Encoding & Client Decoding
console.log('--- Test 1: Simple Stroke Batch ---');
const rawBatch1 = [
  { x: 0.1234, y: 0.5678 },
  { x: 0.1240, y: 0.5685 },
  { x: 0.1250, y: 0.5695 }
];

const encoded1 = encodeBinaryDrawMessage('draw_move_compressed', {
  instanceId: 'test1',
  moves: rawBatch1
});

const view1 = new DataView(encoded1);
console.log(`Packet Type byte: ${view1.getUint8(0)} (Expected: 13 / MSG_DRAW_MOVE_COMPRESSED)`);
if (view1.getUint8(0) !== 13) {
  allPassed = false;
  console.error('❌ FAILED: Packet byte 0 is not 13');
}

const decoded1 = decodeBinaryDrawMessage(encoded1);
console.log('Client Decoded Event:', decoded1.event);
console.log('Client Decoded Moves count:', decoded1.data.moves.length);

let match1 = decoded1.data.moves.length === rawBatch1.length;
for (let i = 0; i < rawBatch1.length; i++) {
  const expQx = Math.round(rawBatch1[i].x * 10000);
  const expQy = Math.round(rawBatch1[i].y * 10000);
  const gotQx = Math.round(decoded1.data.moves[i].x * 10000);
  const gotQy = Math.round(decoded1.data.moves[i].y * 10000);
  if (expQx !== gotQx || expQy !== gotQy) {
    match1 = false;
    break;
  }
}

if (match1) {
  console.log('✅ PASS: Client decoder produced 100% exact integer coordinates!');
} else {
  allPassed = false;
  console.error('❌ FAILED: Coordinate mismatch in client decoder');
}

// 2. Server Decoder Test
console.log('\n--- Test 2: Server Decoder Test ---');
const serverDecoded = serverDecodeCompressedMove(Buffer.from(encoded1));
let serverMatch = serverDecoded.points.length === rawBatch1.length;
for (let i = 0; i < rawBatch1.length; i++) {
  const expQx = Math.round(rawBatch1[i].x * 10000);
  const expQy = Math.round(rawBatch1[i].y * 10000);
  if (expQx !== serverDecoded.points[i].x || expQy !== serverDecoded.points[i].y) {
    serverMatch = false;
    break;
  }
}
if (serverMatch) {
  console.log('✅ PASS: Server decoder produced 100% exact integer coordinates!');
} else {
  allPassed = false;
  console.error('❌ FAILED: Coordinate mismatch in server decoder');
}

// 3. Packet Loss Immunity (Self-Contained Delta Reset Test)
console.log('\n--- Test 3: Packet Loss Immunity Test (Zero Drift) ---');
const batchA = [{ x: 0.1000, y: 0.1000 }, { x: 0.1020, y: 0.1030 }];
const batchB = [{ x: 0.1050, y: 0.1060 }, { x: 0.1080, y: 0.1090 }]; // THIS PACKET WILL BE LOST
const batchC = [{ x: 0.1120, y: 0.1130 }, { x: 0.1150, y: 0.1170 }];

const encA = encodeBinaryDrawMessage('draw_move_compressed', { instanceId: 'loss_test', moves: batchA });
const encB = encodeBinaryDrawMessage('draw_move_compressed', { instanceId: 'loss_test', moves: batchB });
const encC = encodeBinaryDrawMessage('draw_move_compressed', { instanceId: 'loss_test', moves: batchC });

// Simulate client receiving encA, then DROP encB, then receive encC directly:
const decA = decodeBinaryDrawMessage(encA);
// encB dropped!
const decC = decodeBinaryDrawMessage(encC);

const decCFirstPtQx = Math.round(decC.data.moves[0].x * 10000);
const decCFirstPtQy = Math.round(decC.data.moves[0].y * 10000);
const expCFirstPtQx = Math.round(batchC[0].x * 10000);
const expCFirstPtQy = Math.round(batchC[0].y * 10000);

if (decCFirstPtQx === expCFirstPtQx && decCFirstPtQy === expCFirstPtQy) {
  console.log('✅ PASS: Zero drift on packet loss! Packet C decoded from its own absolute origin.');
  console.log(`   Expected C0: (${expCFirstPtQx}, ${expCFirstPtQy}) | Got: (${decCFirstPtQx}, ${decCFirstPtQy})`);
} else {
  allPassed = false;
  console.error('❌ FAILED: Coordinate drift detected after packet loss!');
}

// 4. Wire Size Comparison
console.log('\n--- Test 4: Wire Size & Savings Comparison ---');
// 25 realistic moves
const realisticBatch: { x: number; y: number }[] = [];
for (let i = 0; i < 25; i++) {
  realisticBatch.push({
    x: 0.3 + (i * 0.002) + Math.sin(i * 0.2) * 0.005,
    y: 0.4 + (i * 0.0015) + Math.cos(i * 0.2) * 0.004
  });
}

const standardType2 = encodeBinaryDrawMessage('draw_move', { instanceId: 'size_test', moves: realisticBatch });
const compressedType13 = encodeBinaryDrawMessage('draw_move_compressed', { instanceId: 'size_test', moves: realisticBatch });

const type2Size = standardType2.byteLength;
const type13Size = compressedType13.byteLength;
const saved = type2Size - type13Size;
const pct = ((saved / type2Size) * 100).toFixed(1);

console.log(`25 points batch:`);
console.log(`   Type 2 (Standard):   ${type2Size} B`);
console.log(`   Type 13 (Compressed): ${type13Size} B`);
console.log(`   Saved:               ${saved} B (${pct}%)`);

if (type13Size < type2Size && saved > 0) {
  console.log('✅ PASS: Compressed transport significantly reduces wire bytes per batch!');
} else {
  allPassed = false;
  console.error('❌ FAILED: Compression did not save bytes');
}

// 5. Shape / Complex Curves (Arabic calligraphy simulation, sharp corners, zig-zag)
console.log('\n--- Test 5: Complex Geometric Patterns ---');
const complexMoves: { x: number; y: number }[] = [];
// Arabic calligraphy loop
for (let i = 0; i < 100; i++) {
  const t = i / 100;
  complexMoves.push({
    x: 0.5 + Math.sin(t * Math.PI * 4) * 0.2 * (1 - t),
    y: 0.5 + Math.cos(t * Math.PI * 4) * 0.1 + (t * 0.1)
  });
}

const encComplex = encodeBinaryDrawMessage('draw_move_compressed', { instanceId: 'complex', moves: complexMoves });
const decComplex = decodeBinaryDrawMessage(encComplex);

let complexMatch = decComplex.data.moves.length === complexMoves.length;
for (let i = 0; i < complexMoves.length; i++) {
  const qx1 = Math.round(complexMoves[i].x * 10000);
  const qy1 = Math.round(complexMoves[i].y * 10000);
  const qx2 = Math.round(decComplex.data.moves[i].x * 10000);
  const qy2 = Math.round(decComplex.data.moves[i].y * 10000);
  if (qx1 !== qx2 || qy1 !== qy2) {
    complexMatch = false;
    break;
  }
}

if (complexMatch) {
  console.log(`✅ PASS: Complex Arabic calligraphy loop (100 points) decoded with 100% precision!`);
  console.log(`   Type 2 Size: ${10 + 100 * 4} B | Type 13 Size: ${encComplex.byteLength} B | Saved: ${(10 + 100 * 4) - encComplex.byteLength} B (${((( (10 + 100 * 4) - encComplex.byteLength) / (10 + 100 * 4)) * 100).toFixed(1)}%)`);
} else {
  allPassed = false;
  console.error('❌ FAILED: Mismatch in complex curve decoding');
}

console.log('\n====================================================');
if (allPassed) {
  console.log('🎉 ALL EXPERIMENTAL COMPRESSED TRANSPORT TESTS PASSED!');
} else {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
}
console.log('====================================================');
