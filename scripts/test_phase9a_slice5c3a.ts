import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';

import { checkRateLimit } from '../server/rateLimit.js';
import { RoomManager } from '../server/rooms.js';
import {
  handleSubmitVoteKick,
  registerVoteKickHandler,
  VOTEKICK_ALERT_COOLDOWN_MS,
} from '../server/registerVoteKickHandler.js';
import { registerJoinRoomHandler } from '../server/registerJoinRoomHandler.js';
import type { Player } from '../src/types/game.js';

console.log('==================================================================');
console.log('🛡️  PHASE 9A — SLICE 5C-3A: VOTE-KICK SERVER HARDENING SUITE');
console.log('==================================================================\n');

let passCount = 0;
let failCount = 0;

function check(condition: boolean, label: string, details?: string) {
  if (condition) {
    passCount++;
    console.log(`✅ PASS: ${label}`);
  } else {
    failCount++;
    console.error(`❌ FAIL: ${label}${details ? ` -> ${details}` : ''}`);
  }
}

function stopManagerTimers(rm: RoomManager) {
  if ((rm as any).tickInterval) {
    clearInterval((rm as any).tickInterval);
    (rm as any).tickInterval = null;
  }
  const evictionTimers: Map<string, NodeJS.Timeout> | undefined = (rm as any).evictionTimers;
  if (evictionTimers) {
    for (const timer of evictionTimers.values()) clearTimeout(timer);
    evictionTimers.clear();
  }
  const phaseTimers: Map<string, NodeJS.Timeout> | undefined = (rm as any).phaseDeadlineTimers;
  if (phaseTimers) {
    for (const timer of phaseTimers.values()) clearTimeout(timer);
    phaseTimers.clear();
  }
}

function createMockIo() {
  const roomEmits: { roomId: string; event: string; payload: any }[] = [];
  const socketEmits: { targetId: string; event: string; payload: any }[] = [];
  const leaves: { socketId: string; roomId: string }[] = [];
  const mockSockets = new Map<string, { leave: (r: string) => void; emit: (e: string, p?: any) => void }>();

  const registerSocket = (id: string) => {
    const s = {
      leave: (roomId: string) => {
        leaves.push({ socketId: id, roomId });
      },
      emit: (event: string, payload?: any) => {
        socketEmits.push({ targetId: id, event, payload });
      },
    };
    mockSockets.set(id, s);
    return s;
  };

  const io = {
    to(targetId: string) {
      return {
        emit(event: string, payload?: any) {
          if (mockSockets.has(targetId)) {
            socketEmits.push({ targetId, event, payload });
          } else {
            roomEmits.push({ roomId: targetId, event, payload });
          }
        },
      };
    },
    sockets: {
      sockets: mockSockets,
    },
  };

  return { io, roomEmits, socketEmits, leaves, registerSocket };
}

function emitWithAck<T = any>(
  socket: ClientSocket,
  event: string,
  ...args: any[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack on "${event}"`));
    }, 4000);
    socket.emit(event, ...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

function makePlayer(id: string, name: string, avatar: string, persistentId?: string): Player {
  return {
    id,
    name,
    avatar,
    roomId: null,
    score: 0,
    wins: 0,
    persistentId,
  };
}

async function runDeterministicUnitTests() {
  console.log('--- PART A: DETERMINISTIC UNIT & LIFECYCLE VERIFICATION (CASES 1–12) ---');
  const realDateNow = Date.now;
  let mockNow = 1_700_000_000_000;
  Date.now = () => mockNow;

  const { io, roomEmits, socketEmits, registerSocket } = createMockIo();
  const rm = new RoomManager();
  rm.setIo(io as any);
  stopManagerTimers(rm);
  const voteKickLimits = new Map<string, number[]>();

  try {
    const roomId = 'classic_5c3a_unit';
    const room = rm.createRoom(roomId);
    rm.addPlayerToRoom(roomId, makePlayer('sock-a', 'Alice', 'avatar1', 'pid-a'));
    rm.addPlayerToRoom(roomId, makePlayer('sock-b', 'Bob', 'avatar2', 'pid-b'));
    rm.addPlayerToRoom(roomId, makePlayer('sock-c', 'Charlie', 'avatar3', 'pid-c'));
    rm.addPlayerToRoom(roomId, makePlayer('sock-d', 'Dana', 'avatar4', 'pid-d'));
    registerSocket('sock-a');
    registerSocket('sock-b');
    registerSocket('sock-c');
    registerSocket('sock-d');

    // Clear initial join emissions and instrument sendStateToPlayer
    roomEmits.length = 0;
    socketEmits.length = 0;
    const sendStateRecipients: string[] = [];
    const origSendState = rm.sendStateToPlayer.bind(rm);
    (rm as any).sendStateToPlayer = (targetRoom: any, playerObj: any) => {
      sendStateRecipients.push(playerObj?.id || 'unknown');
      return origSendState(targetRoom, playerObj);
    };

    const deps = {
      io,
      roomManager: rm,
      voteKickLimits,
      checkRateLimit,
    };

    // 1. Self-vote rejection
    {
      const alertsBefore = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      const chatBefore = room.chatMessages.length;
      const stateCallsBefore = sendStateRecipients.length;
      let cbRes: any = null;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-a' }, (r: any) => (cbRes = r), deps);

      const alertsAfter = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      check(
        cbRes?.success === false && cbRes?.error === 'cannot_vote_self',
        '1a. Self-vote returns { success: false, error: "cannot_vote_self" }',
        JSON.stringify(cbRes)
      );
      check(
        Object.keys(room.votekicks || {}).length === 0,
        '1b. Self-vote does not mutate room.votekicks',
        JSON.stringify(room.votekicks)
      );
      check(
        room.chatMessages.length === chatBefore && alertsAfter === alertsBefore,
        '1c. Self-vote does not add chat messages or emit votekick_alert'
      );
      check(
        sendStateRecipients.length === stateCallsBefore &&
          (room.votekickAlertCooldowns?.size || 0) === 0,
        '1d. Self-vote does not broadcast state or record alert cooldown'
      );
    }

    // 2. Normal voting
    {
      let cbRes: any = null;
      const alertsBefore = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-b' }, (r: any) => (cbRes = r), deps);
      const alertsAfter = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      check(
        cbRes?.success === true && cbRes?.voted === true && cbRes?.count === 1 && cbRes?.required === 2,
        '2a. Normal first vote succeeds with voted:true, count:1, required:2',
        JSON.stringify(cbRes)
      );
      check(
        alertsAfter - alertsBefore === 1,
        '2b. Normal first vote emits exactly 1 votekick_alert',
        `delta=${alertsAfter - alertsBefore}`
      );
    }

    // 3 & 12. Vote withdrawal + exact unvote broadcast count (no duplicate send to voter/target)
    {
      mockNow += 500; // within 60s
      let cbRes: any = null;
      sendStateRecipients.length = 0;
      const alertsBefore = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-b' }, (r: any) => (cbRes = r), deps);

      const alertsAfter = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      const uniqueRecipients = new Set(sendStateRecipients);

      check(
        cbRes?.success === true && cbRes?.voted === false && cbRes?.count === 0,
        '3a. Vote withdrawal succeeds with voted:false, count:0',
        JSON.stringify(cbRes)
      );
      check(
        alertsAfter === alertsBefore,
        '3b. Vote withdrawal emits no votekick_alert'
      );
      check(
        sendStateRecipients.length === room.players.length &&
          uniqueRecipients.size === room.players.length &&
          uniqueRecipients.has('sock-a') &&
          uniqueRecipients.has('sock-b'),
        '12. Exact room_state_update count on unvote equals room.players.length with zero duplicates',
        `sent=${sendStateRecipients.length}, players=${room.players.length}, recipients=${JSON.stringify(sendStateRecipients)}`
      );
    }

    // 4 & 5. Re-voting within 60s succeeds AND notification emitted only once across repeated cycles
    {
      mockNow += 2_001; // fresh 2s RL window while still well inside 60s alert cooldown (t = +2.5s)
      let cbRevote1: any = null;
      const alertsBefore = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-b' }, (r: any) => (cbRevote1 = r), deps);
      const alertsAfter1 = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      check(
        cbRevote1?.success === true && cbRevote1?.voted === true && cbRevote1?.count === 1,
        '4. Re-voting within 60s succeeds and restores vote count=1',
        JSON.stringify(cbRevote1)
      );
      check(
        alertsAfter1 === alertsBefore,
        '5a. Re-voting same target within 60s suppresses duplicate votekick_alert'
      );

      // Advance 5s (past 2s RL window, still within 60s cooldown) and toggle unvote -> re-vote again
      mockNow += 5_000;
      let cbUnvote2: any = null;
      let cbRevote2: any = null;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-b' }, (r: any) => (cbUnvote2 = r), deps);
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-b' }, (r: any) => (cbRevote2 = r), deps);
      const alertsAfterCycle = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      check(
        cbUnvote2?.voted === false && cbRevote2?.voted === true && alertsAfterCycle === alertsBefore,
        '5b. Repeated vote/unvote/re-vote cycle within 60s emits zero additional votekick_alerts',
        `alertsDelta=${alertsAfterCycle - alertsBefore}`
      );
    }

    // 7. Different target has independent cooldown (Alice votes Charlie immediately)
    {
      let cbDiffTarget: any = null;
      const alertsBefore = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-c' }, (r: any) => (cbDiffTarget = r), deps);
      const alertsAfter = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      check(
        cbDiffTarget?.success === true && cbDiffTarget?.voted === true && alertsAfter - alertsBefore === 1,
        '7. Different target (Alice -> Charlie) has independent cooldown and emits votekick_alert immediately',
        `delta=${alertsAfter - alertsBefore}`
      );
    }

    // 6. Notification allowed again after >= 60,000ms elapses
    {
      // Withdraw Alice's vote on Bob first, then advance past 60s from original t=0
      mockNow += 60_000; // now t >= +66,000ms since initial alert at t=0
      let cbUnvoteOld: any = null;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-b' }, (r: any) => (cbUnvoteOld = r), deps);

      const alertsBefore = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      let cbAfterCooldown: any = null;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-b' }, (r: any) => (cbAfterCooldown = r), deps);
      const alertsAfter = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      check(
        cbUnvoteOld?.voted === false &&
          cbAfterCooldown?.success === true &&
          cbAfterCooldown?.voted === true &&
          alertsAfter - alertsBefore === 1,
        `6. After >= ${VOTEKICK_ALERT_COOLDOWN_MS}ms elapses, votekick_alert is emitted again`,
        `delta=${alertsAfter - alertsBefore}`
      );
    }

    // 8. Different voter has independent cooldown (Charlie -> Bob), AND notice Alice->Bob triggers ban quorum!
    // First test Charlie -> Dana before testing quorum ban on Bob so #8 is tested cleanly without immediate eviction,
    // OR let Charlie -> Bob wait until after #8 checks independent voter on a shared target Dana.
    {
      // Alice votes Dana (1st alert)
      let cbAliceDana: any = null;
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-d' }, (r: any) => (cbAliceDana = r), deps);
      // Withdraw Alice's vote on Dana? No, test Bob voting Dana immediately as different voter!
      // Wait: if room has 4 online players, required = 2 -> voting Dana twice bans Dana.
      // Let's add a 6th player temporarily (required = 3) so Bob and Charlie can both vote Dana without banning Dana prematurely.
      rm.addPlayerToRoom(roomId, makePlayer('sock-e', 'Eve', 'avatar5', 'pid-e'));
      rm.addPlayerToRoom(roomId, makePlayer('sock-f', 'Frank', 'avatar6', 'pid-f'));
      registerSocket('sock-e');
      registerSocket('sock-f');
      // Online count = 6 -> required = 3.
      const alertsBefore = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      let cbBobDana: any = null;
      handleSubmitVoteKick({ id: 'sock-b' }, { targetPlayerId: 'pid-d' }, (r: any) => (cbBobDana = r), deps);
      const alertsAfter = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;

      check(
        cbAliceDana?.voted === true &&
          cbBobDana?.success === true &&
          cbBobDana?.voted === true &&
          cbBobDana?.count === 2 &&
          alertsAfter - alertsBefore === 1,
        '8. Different voter on same target (Bob -> Dana) has independent cooldown and emits votekick_alert immediately',
        `delta=${alertsAfter - alertsBefore}, count=${cbBobDana?.count}`
      );
    }

    // 9. Quorum and ban behavior remain intact even when a re-vote within 60s supplies the decisive vote
    {
      // Vote Eve by Alice & Bob (while 6 players -> required = 3), then let Charlie supply 3rd vote, OR
      // test Eve: Alice votes Eve, Bob votes Eve, Alice unvotes Eve, Charlie votes Eve (2 votes),
      // then Alice RE-VOTES Eve within 60s -> decisive 3rd vote bans Eve even though alert is suppressed!
      mockNow += 5_000;
      let cbA1: any = null;
      let cbB1: any = null;
      let cbAUn: any = null;
      let cbC1: any = null;
      let cbARevoteDecisive: any = null;

      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-e' }, (r: any) => (cbA1 = r), deps);
      handleSubmitVoteKick({ id: 'sock-b' }, { targetPlayerId: 'pid-e' }, (r: any) => (cbB1 = r), deps);
      handleSubmitVoteKick({ id: 'sock-a' }, { targetPlayerId: 'pid-e' }, (r: any) => (cbAUn = r), deps);
      handleSubmitVoteKick({ id: 'sock-c' }, { targetPlayerId: 'pid-e' }, (r: any) => (cbC1 = r), deps);

      const alertsBeforeDecisiveRevote = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      socketEmits.length = 0;

      handleSubmitVoteKick(
        { id: 'sock-a' },
        { targetPlayerId: 'pid-e' },
        (r: any) => (cbARevoteDecisive = r),
        deps
      );

      const alertsAfterDecisiveRevote = roomEmits.filter(
        (e) => e.event === 'receive_message' && e.payload?.type === 'votekick_alert'
      ).length;
      const eveBannedEmit = socketEmits.some(
        (e) => e.targetId === 'sock-e' && e.event === 'banned_from_room'
      );
      const eveStillInRoom = room.players.some((p) => p.persistentId === 'pid-e');

      check(
        cbA1?.voted === true &&
          cbB1?.voted === true &&
          cbAUn?.voted === false &&
          cbC1?.count === 2 &&
          cbARevoteDecisive?.success === true &&
          cbARevoteDecisive?.voted === true &&
          cbARevoteDecisive?.count === 3 &&
          room.bannedUsers.includes('pid-e') &&
          eveBannedEmit &&
          !eveStillInRoom,
        '9a. Re-vote within 60s supplying decisive vote still completes quorum, bans user, and evicts player',
        `revote=${JSON.stringify(cbARevoteDecisive)}, banned=${JSON.stringify(room.bannedUsers)}`
      );
      check(
        alertsAfterDecisiveRevote === alertsBeforeDecisiveRevote,
        '9b. Decisive re-vote within 60s still suppresses redundant votekick_alert while executing ban'
      );

      // 11 (part 1). Banned/removed target's cooldown entries were cleaned up by removePlayerFromRoom
      const hasEveEntry = Array.from(room.votekickAlertCooldowns?.values() || []).some(
        (entry) => entry.targetId === 'pid-e' || entry.targetId === 'sock-e'
      );
      check(
        !hasEveEntry,
        '11a. Cooldown entries targeting evicted/removed player (Eve) are cleaned immediately'
      );
    }

    // 10. Existing 3 requests / 2000ms rate limit remains unchanged
    {
      mockNow += 5_000; // fresh 2s RL window for sock-f toggling vote on Alice (0 votes -> 1 -> 0 -> 1, never reaching quorum)
      const results: any[] = [];
      for (let i = 0; i < 4; i++) {
        let res: any = null;
        handleSubmitVoteKick({ id: 'sock-f' }, { targetPlayerId: 'pid-a' }, (r: any) => (res = r), deps);
        results.push(res);
      }

      mockNow += 2_001;
      let resAfterWindow: any = null;
      handleSubmitVoteKick(
        { id: 'sock-f' },
        { targetPlayerId: 'pid-a' },
        (r: any) => (resAfterWindow = r),
        deps
      );

      check(
        results[0]?.success === true &&
          results[1]?.success === true &&
          results[2]?.success === true &&
          results[3]?.success === false &&
          results[3]?.error === 'rate_limited' &&
          resAfterWindow?.success === true,
        '10. Existing 3 requests / 2000ms rate limit remains intact (4th rejected, resets after 2001ms)',
        JSON.stringify({ results, resAfterWindow })
      );
    }

    // 11 (part 2 & 3). Expired timestamp pruning on subsequent notification op & empty-room clear
    {
      // Confirm expired pruning during subsequent notification op:
      // At mockNow + 65_000, all existing cooldown entries have expired. A single new vote should prune all stale entries so size === 1.
      mockNow += 65_000;
      let cbFresh: any = null;
      handleSubmitVoteKick({ id: 'sock-c' }, { targetPlayerId: 'pid-a' }, (r: any) => (cbFresh = r), deps);
      check(
        cbFresh?.success === true && room.votekickAlertCooldowns?.size === 1,
        '11b. Subsequent notification operation prunes all expired cooldown entries (size bounded to 1)',
        `size=${room.votekickAlertCooldowns?.size}`
      );

      // Test removePlayerFromRoom pruning on remaining players removal & empty room deletion
      const cooldownMapRef = room.votekickAlertCooldowns!;
      // Add an artificial stale entry as well
      cooldownMapRef.set('stale-check', {
        voterId: 'pid-x',
        targetId: 'pid-y',
        sentAt: mockNow - VOTEKICK_ALERT_COOLDOWN_MS - 10,
      });
      rm.removePlayerFromRoom(roomId, 'sock-d');
      check(
        !cooldownMapRef.has('stale-check'),
        '11c. removePlayerFromRoom prunes expired cooldown entries while room still has players'
      );

      // Remove all remaining players to trigger empty-room deletion
      for (const p of [...room.players]) {
        rm.removePlayerFromRoom(roomId, p.id);
      }
      check(
        cooldownMapRef.size === 0 && !rm.getRoom(roomId),
        '11d. Empty-room deletion clears votekickAlertCooldowns Map and deletes room'
      );
    }
  } finally {
    Date.now = realDateNow;
    stopManagerTimers(rm);
  }
}

async function runLiveSocketIoTests() {
  console.log('\n--- PART B: LIVE SOCKET.IO + MSGPACK INTEGRATION VERIFICATION ---');
  let httpServer: HttpServer | null = null;
  let io: Server | null = null;
  let rm: RoomManager | null = null;
  const clients: ClientSocket[] = [];

  try {
    httpServer = createServer();
    io = new Server(httpServer, {
      parser: customParser,
      cors: { origin: '*' },
    });
    rm = new RoomManager();
    rm.setIo(io);
    stopManagerTimers(rm);
    const voteKickLimits = new Map<string, number[]>();

    io.on('connection', (socket) => {
      registerJoinRoomHandler(socket, { io: io!, roomManager: rm! });
      registerVoteKickHandler(socket, {
        io: io!,
        roomManager: rm!,
        voteKickLimits,
        checkRateLimit,
      });
    });

    await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}`;

    const connectClient = async () => {
      const c = ioClient(url, {
        parser: customParser,
        transports: ['websocket'],
        forceNew: true,
      });
      clients.push(c);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 4000);
        c.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        c.once('connect_error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
      return c;
    };

    const [c1, c2, c3] = await Promise.all([connectClient(), connectClient(), connectClient()]);
    const roomId = 'classic';
    rm.createRoom(roomId);

    const j1 = await emitWithAck<any>(c1, 'join_room', {
      roomId,
      nickname: 'Player1',
      playerId: 'live-p1',
      reconnectSecret: 'secret-live-p1-0123456789abcdef',
    });
    const j2 = await emitWithAck<any>(c2, 'join_room', {
      roomId,
      nickname: 'Player2',
      playerId: 'live-p2',
      reconnectSecret: 'secret-live-p2-0123456789abcdef',
    });
    const j3 = await emitWithAck<any>(c3, 'join_room', {
      roomId,
      nickname: 'Player3',
      playerId: 'live-p3',
      reconnectSecret: 'secret-live-p3-0123456789abcdef',
    });

    check(
      j1?.success && j2?.success && j3?.success,
      'Live join_room succeeded for 3 real Socket.IO + msgpack clients'
    );

    const c3Alerts: any[] = [];
    const c1States: any[] = [];
    const c2States: any[] = [];
    const c3States: any[] = [];
    c3.on('receive_message', (msg: any) => {
      if (msg?.type === 'votekick_alert') c3Alerts.push(msg);
    });
    c1.on('room_state_update', (s: any) => c1States.push(s));
    c2.on('room_state_update', (s: any) => c2States.push(s));
    c3.on('room_state_update', (s: any) => c3States.push(s));

    // Self-vote over live Socket.IO (on c2 so c1's upcoming vote/unvote/re-vote stays within 3 req/2s)
    const selfVoteAck = await emitWithAck<any>(c2, 'submit_vote_kick', {
      targetPlayerId: 'live-p2',
    });
    check(
      selfVoteAck?.success === false && selfVoteAck?.error === 'cannot_vote_self',
      'Live self-vote rejected with { success: false, error: "cannot_vote_self" }',
      JSON.stringify(selfVoteAck)
    );

    // Vote -> Unvote -> Re-vote within 60s over live wire
    c3Alerts.length = 0;
    const voteAck = await emitWithAck<any>(c1, 'submit_vote_kick', {
      targetPlayerId: 'live-p2',
    });

    // Clear state counters before unvote to count exact unvote room_state_update emissions
    await new Promise((r) => setTimeout(r, 80));
    c1States.length = 0;
    c2States.length = 0;
    c3States.length = 0;

    const unvoteAck = await emitWithAck<any>(c1, 'submit_vote_kick', {
      targetPlayerId: 'live-p2',
    });
    await new Promise((r) => setTimeout(r, 80));

    check(
      unvoteAck?.success === true &&
        unvoteAck?.voted === false &&
        c1States.length === 1 &&
        c2States.length === 1 &&
        c3States.length === 1,
      'Live unvote delivers exactly 1 room_state_update per room player (no duplicates)',
      `counts=[${c1States.length}, ${c2States.length}, ${c3States.length}]`
    );

    const revoteAck = await emitWithAck<any>(c1, 'submit_vote_kick', {
      targetPlayerId: 'live-p2',
    });
    await new Promise((r) => setTimeout(r, 80));

    check(
      voteAck?.voted === true &&
        revoteAck?.success === true &&
        revoteAck?.voted === true &&
        c3Alerts.length === 1,
      'Live vote -> unvote -> re-vote succeeds while emitting exactly 1 votekick_alert',
      `alerts=${c3Alerts.length}`
    );

    // Different voter (c3 -> live-p2) immediately emits alert and reaches quorum (2 votes) to ban c2
    const c2BannedPromise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2000);
      c2.once('banned_from_room', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    const decisiveAck = await emitWithAck<any>(c3, 'submit_vote_kick', {
      targetPlayerId: 'live-p2',
    });
    const c2Banned = await c2BannedPromise;
    await new Promise((r) => setTimeout(r, 80));

    check(
      decisiveAck?.success === true &&
        decisiveAck?.voted === true &&
        c3Alerts.length === 2 &&
        c2Banned === true,
      'Live independent voter triggers alert and reaches quorum ban cleanly',
      `alerts=${c3Alerts.length}, c2Banned=${c2Banned}`
    );
  } finally {
    for (const c of clients) {
      try {
        c.disconnect();
      } catch {
        // ignore
      }
    }
    if (rm) stopManagerTimers(rm);
    if (io) {
      await new Promise<void>((resolve) => io!.close(() => resolve()));
    } else if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
  }
}

async function main() {
  try {
    await runDeterministicUnitTests();
    await runLiveSocketIoTests();
  } catch (err) {
    failCount++;
    console.error('❌ UNHANDLED ERROR:', err);
  }

  console.log('\n==================================================================');
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('==================================================================');
  process.exit(failCount === 0 ? 0 : 1);
}

main();
