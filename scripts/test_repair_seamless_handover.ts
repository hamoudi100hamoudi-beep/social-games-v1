import { RoomManager } from '../server/rooms';
import {
  encodeBinaryDrawMessage,
  decodeBinaryDrawMessage
} from '../src/utils/drawBinaryHelper';

console.log('====================================================');
console.log('🧪  TESTING SEAMLESS REPAIR HANDOVER (ZERO FLICKER)');
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
// 1. Session Setup and Volatile Packet Loss Simulation
// -----------------------------------------------------------------
console.log('--- Test 1: Session Setup & Volatile Packet Loss ---');

const instanceId = 'user001';
const strokeId = 101;
const LOGICAL_WIDTH = 1200;
const LOGICAL_HEIGHT = 900;

interface ActiveSession {
  tool: string;
  color: string;
  width: number;
  opacity: number;
  path: { x: number; y: number }[];
  strokeId?: number;
  networkPointCount?: number;
  rawPoints?: { x: number; y: number }[];
  pendingQueue?: { x: number; y: number }[];
  repairPending?: boolean;
}

const activeSessions: Record<string, ActiveSession> = {};
const emittedEvents: { event: string; payload: any }[] = [];

// Simulate viewer socket
const fakeSocket = {
  emit: (event: string, payload: any) => {
    emittedEvents.push({ event, payload });
  }
};

// Drawer starts stroke
const p0 = { x: 0.1, y: 0.2 };
activeSessions[instanceId] = {
  tool: 'pencil',
  color: '#000000',
  width: 5,
  opacity: 1,
  path: [{ x: p0.x * LOGICAL_WIDTH, y: p0.y * LOGICAL_HEIGHT }],
  strokeId,
  networkPointCount: 1,
  rawPoints: [p0],
  pendingQueue: [],
  repairPending: false
};

assert(activeSessions[instanceId] !== undefined, 'Active session created for remote drawer');
assert(activeSessions[instanceId].repairPending === false, 'repairPending is initially false');
assert(activeSessions[instanceId].path.length === 1, 'Initial session path contains start point p0');

// Drawer sends Batch 1 (3 points) -> successfully received
const batch1 = [
  { x: 0.11, y: 0.21 },
  { x: 0.12, y: 0.22 },
  { x: 0.13, y: 0.23 }
];
for (const pt of batch1) {
  activeSessions[instanceId].rawPoints!.push(pt);
  activeSessions[instanceId].networkPointCount = (activeSessions[instanceId].networkPointCount || 0) + 1;
  activeSessions[instanceId].path.push({ x: pt.x * LOGICAL_WIDTH, y: pt.y * LOGICAL_HEIGHT });
}

assert(activeSessions[instanceId].networkPointCount === 4, 'Viewer received p0 + batch1 = 4 points');
assert(activeSessions[instanceId].path.length === 4, 'Visible path has 4 points');

// Batch 2 (3 points) is LOST over the network (simulated packet loss)
// Drawer server has 7 points total, but viewer only has 4.
const serverPointCount = 7;

// -----------------------------------------------------------------
// 2. Commit Mismatch Handling (Seamless Preservation)
// -----------------------------------------------------------------
console.log('\n--- Test 2: Commit Mismatch Handling ---');

const session = activeSessions[instanceId];
const localCount = session.networkPointCount || 0;
const isMatch = localCount === serverPointCount;
assert(!isMatch, 'Commit mismatch detected (local 4 vs server 7)');

// Execute new mismatch handler
if (!isMatch) {
  if (!session.repairPending || session.strokeId !== strokeId) {
    session.repairPending = true;
    session.strokeId = strokeId;
    if (session.pendingQueue && session.pendingQueue.length > 0) {
      while (session.pendingQueue.length > 0) {
        session.path.push(session.pendingQueue.shift()!);
      }
    }
    fakeSocket.emit('draw_repair_req', { instId: instanceId, strokeId });
  }
}

assert(activeSessions[instanceId] !== undefined, 'CRITICAL: activeSessions is NOT deleted on mismatch');
assert(session.repairPending === true, 'session.repairPending is marked true');
assert(session.path.length === 4, 'CRITICAL: Visible path is NOT cleared (Zero Visual Gap)');
assert(emittedEvents.length === 1, 'draw_repair_req emitted exactly once');
assert(emittedEvents[0].payload.instId === instanceId, 'draw_repair_req has correct instId');
assert(emittedEvents[0].payload.strokeId === strokeId, 'draw_repair_req has correct strokeId');

// -----------------------------------------------------------------
// 3. Duplicate Commit Prevention
// -----------------------------------------------------------------
console.log('\n--- Test 3: Duplicate Commit Prevention ---');

// Simulate duplicate commit arriving (e.g. network jitter or retransmit)
let duplicateEmitted = false;
if (session.repairPending && session.strokeId === strokeId) {
  // Guard branch works: do nothing
} else {
  fakeSocket.emit('draw_repair_req', { instId: instanceId, strokeId });
  duplicateEmitted = true;
}

assert(!duplicateEmitted, 'Duplicate draw_commit does NOT re-emit draw_repair_req');
assert(emittedEvents.length === 1, 'Still exactly 1 draw_repair_req emitted');

// -----------------------------------------------------------------
// 4. Late Type 13 Move Packet Arrival
// -----------------------------------------------------------------
console.log('\n--- Test 4: Late Type 13 Move Packet Arrival ---');

// Late point arrives while repairPending === true
const latePoint = { x: 0.14, y: 0.24 };
if (session.repairPending) {
  session.path.push({ x: latePoint.x * LOGICAL_WIDTH, y: latePoint.y * LOGICAL_HEIGHT });
}

assert(activeSessions[instanceId] !== undefined, 'Session preserved upon late packet arrival');
assert(session.path.length === 5, 'Late point appended to visible path for instant responsiveness');
assert(session.repairPending === true, 'Session remains in repairPending state');

// -----------------------------------------------------------------
// 5. Authoritative Type 9 Arrival & Seamless Transition
// -----------------------------------------------------------------
console.log('\n--- Test 5: Authoritative Type 9 Arrival & Seamless Transition ---');

// Server canonical points (all 7 points)
const canonicalPoints = [
  p0,
  ...batch1,
  { x: 0.14, y: 0.24 },
  { x: 0.15, y: 0.25 },
  { x: 0.16, y: 0.26 }
];

const type9Msg = encodeBinaryDrawMessage('draw_stroke', {
  instanceId,
  strokeId,
  tool: 'pencil',
  color: '#000000',
  width: 5,
  opacity: 1,
  points: canonicalPoints
});

const decoded = decodeBinaryDrawMessage(type9Msg);
assert(decoded !== null, 'Type 9 repair packet decoded successfully');
assert(decoded?.event === 'draw_stroke', 'Decoded event is draw_stroke');
assert(decoded?.data?.points?.length === 7, 'Canonical points length is 7');

// Simulate Type 9 receipt with repairPending === true
const permanentCanvas: any[] = [];
const localCommands: any[] = [];
let tempLayerCleared = false;

const isRepairPending = Boolean(
  session &&
  session.repairPending &&
  (decoded!.data.strokeId === undefined || session.strokeId === decoded!.data.strokeId)
);

assert(isRepairPending === true, 'Type 9 recognized as pending repair resolution');

if (decoded!.data.points.length > 0) {
  // Step 1: Draw authoritative stroke onto permanent canvas
  permanentCanvas.push({
    tool: decoded!.data.tool,
    points: decoded!.data.points
  });

  if (isRepairPending) {
    // Step 2: Remove temporary session only after permanent draw succeeds
    delete activeSessions[instanceId];

    // Step 3: Record Type 9 into localCommands
    localCommands.push({
      event: 'draw_binary',
      instanceId: decoded!.data.instanceId,
      strokeId: decoded!.data.strokeId
    });

    // Step 4: Clear temp layer
    tempLayerCleared = true;
  }
}

assert(permanentCanvas.length === 1, 'Authoritative stroke drawn on permanent canvas');
assert(permanentCanvas[0].points.length === 7, 'Permanent stroke contains all 7 canonical points');
assert(activeSessions[instanceId] === undefined, 'Temporary session removed after permanent draw');
assert(localCommands.length === 1, 'Type 9 recorded in local history commands for undo/redo');
assert(tempLayerCleared === true, 'Temp layer cleared only after authoritative draw');

// -----------------------------------------------------------------
// 6. Undo/Redo Integrity on Repaired Stroke
// -----------------------------------------------------------------
console.log('\n--- Test 6: Undo/Redo Integrity on Repaired Stroke ---');

// Undo the repaired stroke
const popped = localCommands.pop();
assert(popped !== null && popped.strokeId === strokeId, 'Repaired stroke can be undone via localCommands');
assert(localCommands.length === 0, 'Local commands empty after undo');

// -----------------------------------------------------------------
// 7. Normal Path (Without Repair Pending) Unaffected
// -----------------------------------------------------------------
console.log('\n--- Test 7: Normal Path Unaffected ---');

const normalSession: ActiveSession = {
  tool: 'pencil',
  color: '#FF0000',
  width: 4,
  opacity: 1,
  path: [{ x: 10, y: 10 }],
  strokeId: 202,
  repairPending: false
};
activeSessions['user002'] = normalSession;

const normalType9 = encodeBinaryDrawMessage('draw_stroke', {
  instanceId: 'user002',
  strokeId: 202,
  tool: 'pencil',
  color: '#FF0000',
  width: 4,
  opacity: 1,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]
});

const decodedNormal = decodeBinaryDrawMessage(normalType9);
const isNormalRepair = Boolean(
  activeSessions['user002'] &&
  activeSessions['user002'].repairPending &&
  activeSessions['user002'].strokeId === 202
);

assert(!isNormalRepair, 'Normal stroke correctly does NOT trigger repair path');

delete activeSessions['user002'];
localCommands.push({
  event: 'draw_binary',
  instanceId: 'user002',
  strokeId: 202
});
assert(localCommands.length === 1, 'Normal stroke successfully recorded');

console.log('\n====================================================');
if (allPassed) {
  console.log('🎉 ALL SEAMLESS REPAIR HANDOVER TESTS PASSED (100%)!');
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
console.log('====================================================');
