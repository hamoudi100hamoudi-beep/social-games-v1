import {
  encodeCanonicalDeltaVarint,
  decodeCanonicalDeltaVarint,
  validateCanonicalCodec,
  toCanonicalIntPoints,
  encodeZigZag,
  decodeZigZag,
  CanonicalIntPoint
} from '../src/utils/shadowCompression';

interface TestCase {
  name: string;
  points: { x: number; y: number }[];
}

const testCases: TestCase[] = [
  // 1. Single Point
  {
    name: '1. Single Point',
    points: [{ x: 300, y: 200 }]
  },

  // 2. Two Points
  {
    name: '2. Two Points',
    points: [{ x: 300, y: 200 }, { x: 310, y: 205 }]
  },

  // 3. Very close points (delta 0, 1, -1 in integer units)
  {
    name: '3. Very Close Points (Subpixel / minimal deltas)',
    points: [
      { x: 300.00, y: 200.00 },
      { x: 300.08, y: 200.00 }, // same quantized int
      { x: 300.15, y: 200.10 },
      { x: 300.22, y: 200.20 }
    ]
  },

  // 4. Fast Motion (large leaps)
  {
    name: '4. Fast Motion (Large Leaps across screen)',
    points: [
      { x: 50, y: 50 },
      { x: 800, y: 500 },
      { x: 100, y: 600 },
      { x: 950, y: 150 }
    ]
  },

  // 5. Positive Delta Only
  {
    name: '5. Positive Delta Monotonic',
    points: [
      { x: 10, y: 10 },
      { x: 25, y: 30 },
      { x: 45, y: 60 },
      { x: 80, y: 100 },
      { x: 130, y: 150 }
    ]
  },

  // 6. Negative Delta Only
  {
    name: '6. Negative Delta Monotonic',
    points: [
      { x: 500, y: 400 },
      { x: 450, y: 360 },
      { x: 400, y: 300 },
      { x: 320, y: 220 },
      { x: 200, y: 100 }
    ]
  },

  // 7. Sharp Reversal (180 degree back-and-forth)
  {
    name: '7. Sharp Reversal',
    points: [
      { x: 200, y: 200 },
      { x: 450, y: 200 },
      { x: 150, y: 200 },
      { x: 500, y: 200 },
      { x: 100, y: 200 }
    ]
  },

  // 8. Zig-Zag
  {
    name: '8. Zig-Zag Wave',
    points: Array.from({ length: 40 }, (_, i) => ({
      x: 100 + i * 10,
      y: 200 + (i % 2 === 0 ? 40 : -40)
    }))
  },

  // 9. Canvas Boundaries (0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
  {
    name: '9. Canvas Boundaries (0 to 10000 int limits)',
    points: [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 1200, y: 800 },
      { x: 0, y: 800 },
      { x: 0, y: 0 }
    ]
  },

  // 10. Outside Canvas (Negative coordinates and beyond logical boundary)
  {
    name: '10. Outside Canvas (Negative coordinates & Overflows)',
    points: [
      { x: -50, y: -80 },
      { x: 1350, y: 920 },
      { x: -120, y: 400 },
      { x: 600, y: 1100 }
    ]
  },

  // 11. Long Stroke (500 points)
  {
    name: '11. Long Realistic Stroke (500 points)',
    points: Array.from({ length: 500 }, (_, i) => ({
      x: 300 + Math.sin(i * 0.05) * 120 + i * 0.5,
      y: 300 + Math.cos(i * 0.05) * 80 + Math.sin(i * 0.1) * 30
    }))
  },

  // 12. Thousands of Points (5,000 points stress test)
  {
    name: '12. High Density Stress Test (5,000 points)',
    points: Array.from({ length: 5000 }, (_, i) => ({
      x: 400 + Math.sin(i * 0.02) * (150 + Math.sin(i * 0.005) * 50),
      y: 350 + Math.cos(i * 0.02) * (120 + Math.cos(i * 0.005) * 40)
    }))
  }
];

console.log('====================================================');
console.log('🧪 RUNNING COMPREHENSIVE LOSSLESS CODEC TEST SUITE');
console.log('====================================================\n');

let allPassed = true;

for (const tc of testCases) {
  const result = validateCanonicalCodec(tc.points, 1200, 800, false, 0, 1);
  const pass = result.pass && result.pointCountMatch && result.exactCoordinatesMatch && result.codecEstimatedDiff === 0;

  if (!pass) {
    allPassed = false;
    console.error(`❌ FAILED: ${tc.name}`);
    console.error(`   Details:`, result);
  } else {
    console.log(`✅ PASS: ${tc.name}`);
    console.log(`   Points: ${result.originalPointsCount} | Encoded: ${result.actualEncodedBytes} B | Estimated: ${result.estimatedCoordinateBytes} B | Diff: ${result.codecEstimatedDiff} B`);
    console.log(`   Saved: ${result.savedBytes} B (${result.compressionPercent.toFixed(1)}%) | Encoded B/pt: ${result.actualBytesPerPoint.toFixed(2)} B/pt`);
  }
}

// 13. Determinism Test
console.log('\n--- Determinism Test ---');
const samplePoints = testCases[10].points;
const canonicalInt = toCanonicalIntPoints(samplePoints, 1200, 800, false);
const enc1 = encodeCanonicalDeltaVarint(canonicalInt);
const enc2 = encodeCanonicalDeltaVarint(canonicalInt);

let isIdenticalBytes = enc1.byteLength === enc2.byteLength;
if (isIdenticalBytes) {
  for (let i = 0; i < enc1.byteLength; i++) {
    if (enc1[i] !== enc2[i]) {
      isIdenticalBytes = false;
      break;
    }
  }
}

if (isIdenticalBytes) {
  console.log(`✅ PASS: Determinism Test: Repeated encodes produce 100% identical byte buffers (${enc1.byteLength} bytes)`);
} else {
  allPassed = false;
  console.error(`❌ FAILED: Determinism Test failed!`);
}

console.log('\n====================================================');
if (allPassed) {
  console.log('🎉 ALL 13 TEST CASES PASSED WITH 100% LOSSLESS EQUALITY!');
} else {
  console.log('❌ SOME TESTS FAILED');
  process.exit(1);
}
console.log('====================================================');
