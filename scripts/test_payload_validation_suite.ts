import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomManager } from '../server/rooms.js';
import {
  registerDrawingIdentityHandlers,
  handleRegisterDrawingIdentity,
  handleUnregisterDrawingIdentity
} from '../server/registerDrawingIdentityHandlers.js';

console.log('====================================================');
console.log('🛡️  PHASE SERVER-AUTH-FIX-3B: PAYLOAD VALIDATION SUITE');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;
let allPassed = true;

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

// Attach the event handlers under test
function attachEventHandlers(socket: any, deps: { io: any; roomManager: RoomManager }) {
  const { io, roomManager } = deps;

  // Use production drawing identity handlers module
  registerDrawingIdentityHandlers(socket, { roomManager });

  socket.on('submit_vote_kick', (data: any, callback?: any) => {
    try {
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        if (typeof callback === 'function') callback({ success: false, error: 'invalid_payload' });
        return;
      }

      const targetPlayerId = typeof data.targetPlayerId === 'string' ? data.targetPlayerId.trim() : '';
      if (!targetPlayerId) {
        if (typeof callback === 'function') callback({ success: false, error: 'invalid_payload' });
        return;
      }

      const player = roomManager.getPlayer(socket.id);
      if (!player || !player.roomId) {
        if (typeof callback === 'function') callback({ error: 'player_not_found' });
        return;
      }

      const roomId = player.roomId;
      const room = roomManager.getRoom(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ error: 'room_not_found' });
        return;
      }

      const targetPlayer = room.players.find(p => p.persistentId === targetPlayerId);
      if (!targetPlayer) {
        if (typeof callback === 'function') callback({ error: 'target_not_found' });
        return;
      }

      if (!room.votekicks) room.votekicks = {};
      if (!room.bannedUsers) room.bannedUsers = [];

      const voters = room.votekicks[targetPlayerId] || [];
      const selfId = player.persistentId || player.id;
      const alreadyVoted = voters.includes(selfId);

      const onlineCount = room.players.filter(p => !p.isOffline).length;

      let requiredVotes = 2;
      if (onlineCount <= 5) {
        requiredVotes = 2;
      } else if (onlineCount === 6) {
        requiredVotes = 3;
      } else if (onlineCount <= 8) {
        requiredVotes = 4;
      } else {
        requiredVotes = 5;
      }

      if (alreadyVoted) {
        const updatedVoters = voters.filter(vId => vId !== selfId);
        room.votekicks[targetPlayerId] = updatedVoters;
        const currentCount = updatedVoters.length;

        if (typeof callback === 'function') callback({ success: true, voted: false, count: currentCount, required: requiredVotes });

        roomManager.sendStateToPlayer(room, player);
        roomManager.sendStateToPlayer(room, targetPlayer);
        room.players.forEach(p => {
          roomManager.sendStateToPlayer(room, p);
        });
        return;
      }

      voters.push(selfId);
      room.votekicks[targetPlayerId] = voters;
      const currentCount = voters.length;

      const announceMsg = {
        id: 'votekick-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
        text: `${player.name} voted to kick out ${targetPlayer.name}`,
        voterName: player.name,
        targetName: targetPlayer.name,
        type: 'votekick_alert'
      };
      roomManager.saveChatMessage(roomId, announceMsg);
      io.to(roomId).emit('receive_message', announceMsg);

      if (currentCount >= requiredVotes) {
        const banId = targetPlayer.persistentId || targetPlayer.id;
        if (!room.bannedUsers.includes(banId)) {
          room.bannedUsers.push(banId);
        }

        io.to(targetPlayer.id).emit('banned_from_room');
        delete room.votekicks[targetPlayerId];

        const socketToKick = io.sockets.sockets?.get ? io.sockets.sockets.get(targetPlayer.id) : null;
        if (socketToKick) {
          socketToKick.leave(roomId);
          socketToKick.emit('banned_from_room');
        }

        const kickedName = targetPlayer.name;
        const targetSocketId = targetPlayer.id;
        roomManager.removePlayerFromRoom(roomId, targetSocketId);
        roomManager.removePlayer(targetSocketId);

        const kickedAnnounce = {
          id: 'sys-' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
          text: `${kickedName} غادر الغرفة`,
          type: 'system'
        };
        roomManager.saveChatMessage(roomId, kickedAnnounce);
        io.to(roomId).emit('receive_message', kickedAnnounce);
      }

      room.players.forEach(p => {
        roomManager.sendStateToPlayer(room, p);
      });

      if (typeof callback === 'function') callback({ success: true, voted: true, count: currentCount, required: requiredVotes });
    } catch (e) {
      console.error('Error in submit_vote_kick event:', e);
      if (typeof callback === 'function') callback({ error: String(e) });
    }
  });
}

async function runTests() {
  const rm = new RoomManager();

  // -------------------------------------------------------------
  // Test Group 1: register_drawing_identity Unit Validations
  // -------------------------------------------------------------
  console.log('\n--- Test Group 1: register_drawing_identity Unit Validations ---');
  {
    const invalidPayloads: any[] = [
      null,
      undefined,
      123,
      'inst-string-not-object',
      true,
      false,
      [],
      ['inst-1'],
      {},
      { instanceId: null },
      { instanceId: undefined },
      { instanceId: 123 },
      { instanceId: '' },
      { instanceId: '   ' },
      { wrongKey: 'inst-123' },
      { instanceId: ['nested'] },
      { instanceId: { obj: true } }
    ];

    for (let i = 0; i < invalidPayloads.length; i++) {
      const payload = invalidPayloads[i];
      const mockSockId = `sock-reg-invalid-${i}`;
      let registered = false;

      const mockRm: any = {
        registerDrawingIdentity: () => { registered = true; }
      };

      const eventHandlers: Record<string, Function> = {};
      const mockSocket = {
        id: mockSockId,
        on: (ev: string, fn: Function) => { eventHandlers[ev] = fn; }
      };

      attachEventHandlers(mockSocket, { io: {}, roomManager: mockRm });

      let threw = false;
      try {
        eventHandlers['register_drawing_identity'](payload);
      } catch (e) {
        threw = true;
      }

      assert(!threw, `REG-1.${i + 1}: register_drawing_identity does not throw on invalid payload ${JSON.stringify(payload)}`);
      assert(!registered, `REG-1.${i + 1}: register_drawing_identity does not register for invalid payload ${JSON.stringify(payload)}`);
    }

    // Valid payload
    {
      let registeredWith: { socketId: string; instanceId: string } | null = null;
      const mockRm: any = {
        registerDrawingIdentity: (sId: string, instId: string) => {
          registeredWith = { socketId: sId, instanceId: instId };
        }
      };

      const eventHandlers: Record<string, Function> = {};
      const mockSocket = {
        id: 'sock-reg-valid-1',
        on: (ev: string, fn: Function) => { eventHandlers[ev] = fn; }
      };

      attachEventHandlers(mockSocket, { io: {}, roomManager: mockRm });

      eventHandlers['register_drawing_identity']({ instanceId: '  instance-alpha-99  ' });
      assert(registeredWith !== null, 'REG-1.V1: register_drawing_identity succeeds for valid payload');
      assert((registeredWith as any)?.socketId === 'sock-reg-valid-1', 'REG-1.V1: passes correct socket.id');
      assert((registeredWith as any)?.instanceId === 'instance-alpha-99', 'REG-1.V1: trims instanceId properly');

      // Direct call to exported production handleRegisterDrawingIdentity
      let directRegWith: any = null;
      handleRegisterDrawingIdentity(
        { id: 'sock-direct-1' },
        { instanceId: 'inst-direct-123' },
        { roomManager: { registerDrawingIdentity: (s: string, id: string) => { directRegWith = { s, id }; } } }
      );
      assert(directRegWith?.s === 'sock-direct-1' && directRegWith?.id === 'inst-direct-123', 'REG-1.V2: Direct handleRegisterDrawingIdentity invocation works');
    }
  }

  // -------------------------------------------------------------
  // Test Group 2: unregister_drawing_identity Unit Validations
  // -------------------------------------------------------------
  console.log('\n--- Test Group 2: unregister_drawing_identity Unit Validations ---');
  {
    const invalidPayloads: any[] = [
      null,
      undefined,
      456,
      'inst-raw',
      true,
      [],
      {},
      { instanceId: null },
      { instanceId: 999 },
      { instanceId: '' },
      { instanceId: '     ' },
      { wrongKey: 'inst-456' }
    ];

    for (let i = 0; i < invalidPayloads.length; i++) {
      const payload = invalidPayloads[i];
      let unregistered = false;

      const mockRm: any = {
        unregisterDrawingIdentity: () => { unregistered = true; }
      };

      const eventHandlers: Record<string, Function> = {};
      const mockSocket = {
        id: `sock-unreg-invalid-${i}`,
        on: (ev: string, fn: Function) => { eventHandlers[ev] = fn; }
      };

      attachEventHandlers(mockSocket, { io: {}, roomManager: mockRm });

      let threw = false;
      try {
        eventHandlers['unregister_drawing_identity'](payload);
      } catch (e) {
        threw = true;
      }

      assert(!threw, `UNREG-2.${i + 1}: unregister_drawing_identity does not throw on invalid payload ${JSON.stringify(payload)}`);
      assert(!unregistered, `UNREG-2.${i + 1}: unregister_drawing_identity does not unregister for invalid payload ${JSON.stringify(payload)}`);
    }

    // Valid payload
    {
      let unregisteredWith: { socketId: string; instanceId: string } | null = null;
      const mockRm: any = {
        unregisterDrawingIdentity: (sId: string, instId: string) => {
          unregisteredWith = { socketId: sId, instanceId: instId };
        }
      };

      const eventHandlers: Record<string, Function> = {};
      const mockSocket = {
        id: 'sock-unreg-valid-1',
        on: (ev: string, fn: Function) => { eventHandlers[ev] = fn; }
      };

      attachEventHandlers(mockSocket, { io: {}, roomManager: mockRm });

      eventHandlers['unregister_drawing_identity']({ instanceId: '  instance-beta-88  ' });
      assert(unregisteredWith !== null, 'UNREG-2.V1: unregister_drawing_identity succeeds for valid payload');
      assert((unregisteredWith as any)?.socketId === 'sock-unreg-valid-1', 'UNREG-2.V1: passes correct socket.id');
      assert((unregisteredWith as any)?.instanceId === 'instance-beta-88', 'UNREG-2.V1: trims instanceId properly');

      // Direct call to exported production handleUnregisterDrawingIdentity
      let directUnregWith: any = null;
      handleUnregisterDrawingIdentity(
        { id: 'sock-direct-2' },
        { instanceId: 'inst-direct-456' },
        { roomManager: { unregisterDrawingIdentity: (s: string, id: string) => { directUnregWith = { s, id }; } } }
      );
      assert(directUnregWith?.s === 'sock-direct-2' && directUnregWith?.id === 'inst-direct-456', 'UNREG-2.V2: Direct handleUnregisterDrawingIdentity invocation works');
    }
  }

  // -------------------------------------------------------------
  // Test Group 3: submit_vote_kick Unit Validations
  // -------------------------------------------------------------
  console.log('\n--- Test Group 3: submit_vote_kick Unit Validations ---');
  {
    const testRoomId = 'vote-test-room-1';
    const testRoom = rm.createRoom(testRoomId);

    const voterPid = 'pid-voter-1';
    const voterSockId = 'sock-voter-1';
    const targetPid = 'pid-target-1';
    const targetSockId = 'sock-target-1';

    rm.addPlayerToRoom(testRoomId, {
      id: voterSockId,
      name: 'Voter1',
      avatar: '👑',
      score: 0,
      wins: 0,
      roomId: testRoomId,
      persistentId: voterPid,
      isOffline: false
    });

    rm.addPlayerToRoom(testRoomId, {
      id: targetSockId,
      name: 'Target1',
      avatar: '🎯',
      score: 0,
      wins: 0,
      roomId: testRoomId,
      persistentId: targetPid,
      isOffline: false
    });

    let broadcastedMessages: any[] = [];
    const mockIo = {
      to: (rId: string) => ({
        emit: (ev: string, data: any) => {
          if (ev === 'receive_message') broadcastedMessages.push(data);
        }
      }),
      sockets: {
        sockets: new Map()
      }
    };

    const eventHandlers: Record<string, Function> = {};
    const mockSocket = {
      id: voterSockId,
      on: (ev: string, fn: Function) => { eventHandlers[ev] = fn; }
    };

    attachEventHandlers(mockSocket, { io: mockIo, roomManager: rm });

    // 3.1 Invalid payloads with callback
    const invalidVotePayloads: any[] = [
      null,
      undefined,
      12345,
      'just-a-string',
      true,
      false,
      [],
      ['target-1'],
      {},
      { targetPlayerId: null },
      { targetPlayerId: undefined },
      { targetPlayerId: 999 },
      { targetPlayerId: '' },
      { targetPlayerId: '     ' },
      { wrongField: targetPid },
      { targetPlayerId: ['array'] },
      { targetPlayerId: { nested: true } }
    ];

    for (let i = 0; i < invalidVotePayloads.length; i++) {
      const payload = invalidVotePayloads[i];
      let callbackResult: any = null;
      let callbackCalled = false;
      const initialVotekicks = JSON.stringify(testRoom.votekicks || {});
      const initialMsgCount = testRoom.chatMessages.length;
      broadcastedMessages = [];

      let threw = false;
      try {
        eventHandlers['submit_vote_kick'](payload, (res: any) => {
          callbackCalled = true;
          callbackResult = res;
        });
      } catch (e) {
        threw = true;
      }

      assert(!threw, `VOTE-3.1.${i + 1}: submit_vote_kick does not throw on invalid payload ${JSON.stringify(payload)}`);
      assert(callbackCalled, `VOTE-3.1.${i + 1}: callback called for invalid payload ${JSON.stringify(payload)}`);
      assert(callbackResult?.success === false, `VOTE-3.1.${i + 1}: callbackResult.success is false`);
      assert(callbackResult?.error === 'invalid_payload', `VOTE-3.1.${i + 1}: callbackResult.error is invalid_payload`);
      assert(JSON.stringify(testRoom.votekicks || {}) === initialVotekicks, `VOTE-3.1.${i + 1}: votekicks state unmutated`);
      assert(testRoom.chatMessages.length === initialMsgCount, `VOTE-3.1.${i + 1}: no chat messages added to room`);
      assert(broadcastedMessages.length === 0, `VOTE-3.1.${i + 1}: zero messages broadcasted`);
    }

    // 3.2 Non-function callback / missing callback with invalid payload does not throw
    {
      let threwNoCallback = false;
      try {
        eventHandlers['submit_vote_kick'](null);
      } catch (e) {
        threwNoCallback = true;
      }
      assert(!threwNoCallback, 'VOTE-3.2: submit_vote_kick with null payload and NO callback does not throw');

      let threwBadCallback = false;
      try {
        eventHandlers['submit_vote_kick'](null, 'not-a-function');
      } catch (e) {
        threwBadCallback = true;
      }
      assert(!threwBadCallback, 'VOTE-3.2: submit_vote_kick with null payload and invalid callback type does not throw');
    }

    // 3.3 Unknown player / room
    {
      const ghostHandlers: Record<string, Function> = {};
      const ghostSocket = {
        id: 'sock-ghost-1',
        on: (ev: string, fn: Function) => { ghostHandlers[ev] = fn; }
      };
      attachEventHandlers(ghostSocket, { io: mockIo, roomManager: rm });

      let ghostRes: any = null;
      ghostHandlers['submit_vote_kick']({ targetPlayerId: targetPid }, (res: any) => {
        ghostRes = res;
      });
      assert(ghostRes?.error === 'player_not_found', 'VOTE-3.3: Player not in room returns player_not_found');
    }

    // 3.4 Target not found in room
    {
      let targetNotFoundRes: any = null;
      eventHandlers['submit_vote_kick']({ targetPlayerId: 'pid-non-existent' }, (res: any) => {
        targetNotFoundRes = res;
      });
      assert(targetNotFoundRes?.error === 'target_not_found', 'VOTE-3.4: Target not in room returns target_not_found');
    }

    // 3.5 Legitimate Vote submission and toggle (add vote then remove vote)
    {
      let voteRes1: any = null;
      eventHandlers['submit_vote_kick']({ targetPlayerId: targetPid }, (res: any) => {
        voteRes1 = res;
      });

      assert(voteRes1?.success === true, 'VOTE-3.5: Legitimate vote returns success: true');
      assert(voteRes1?.voted === true, 'VOTE-3.5: Returns voted: true on vote addition');
      assert(voteRes1?.count === 1, 'VOTE-3.5: Current vote count is 1');
      assert(voteRes1?.required === 2, 'VOTE-3.5: Required votes for 2 players is 2');
      assert(testRoom.votekicks[targetPid]?.includes(voterPid), 'VOTE-3.5: Voter persistentId recorded in votekicks');

      // Vote again to remove vote
      let voteRes2: any = null;
      eventHandlers['submit_vote_kick']({ targetPlayerId: `  ${targetPid}  ` }, (res: any) => {
        voteRes2 = res;
      });

      assert(voteRes2?.success === true, 'VOTE-3.5: Vote removal returns success: true');
      assert(voteRes2?.voted === false, 'VOTE-3.5: Returns voted: false on vote removal');
      assert(voteRes2?.count === 0, 'VOTE-3.5: Current vote count is 0');
      assert(!testRoom.votekicks[targetPid]?.includes(voterPid), 'VOTE-3.5: Voter persistentId removed from votekicks');
    }

    // 3.6 Ban decision reached when quorum met
    {
      // Add Player 3 to voter list
      const voter3Pid = 'pid-voter-3';
      const voter3SockId = 'sock-voter-3';
      rm.addPlayerToRoom(testRoomId, {
        id: voter3SockId,
        name: 'Voter3',
        avatar: '🦊',
        score: 0,
        wins: 0,
        roomId: testRoomId,
        persistentId: voter3Pid,
        isOffline: false
      });

      // Voter 1 votes
      eventHandlers['submit_vote_kick']({ targetPlayerId: targetPid }, () => {});

      // Voter 3 votes
      const voter3Handlers: Record<string, Function> = {};
      const voter3Socket = {
        id: voter3SockId,
        on: (ev: string, fn: Function) => { voter3Handlers[ev] = fn; }
      };
      attachEventHandlers(voter3Socket, { io: mockIo, roomManager: rm });

      let bannedEmitted = false;
      const targetMockSocket = {
        id: targetSockId,
        leave: () => {},
        emit: (ev: string) => { if (ev === 'banned_from_room') bannedEmitted = true; }
      };
      mockIo.sockets.sockets.set(targetSockId, targetMockSocket);

      let finalVoteRes: any = null;
      voter3Handlers['submit_vote_kick']({ targetPlayerId: targetPid }, (res: any) => {
        finalVoteRes = res;
      });

      assert(finalVoteRes?.success === true, 'VOTE-3.6: Quorum vote returns success: true');
      assert(testRoom.bannedUsers?.includes(targetPid), 'VOTE-3.6: Target added to bannedUsers');
      assert(testRoom.players.find(p => p.persistentId === targetPid) === undefined, 'VOTE-3.6: Target evicted from room players');
      assert(testRoom.votekicks[targetPid] === undefined, 'VOTE-3.6: votekicks mapping cleaned up for evicted user');
    }
  }

  // -------------------------------------------------------------
  // Test Group 4: Real Network Socket.IO Integration Tests
  // -------------------------------------------------------------
  console.log('\n--- Test Group 4: Real Socket.IO Network Integration Tests ---');
  {
    const netHttpServer = createServer();
    const netIo = new Server(netHttpServer);
    const netRm = new RoomManager();
    netRm.setIo(netIo);

    netIo.on('connection', (socket) => {
      attachEventHandlers(socket, { io: netIo, roomManager: netRm });
    });

    await new Promise<void>((resolve) => netHttpServer.listen(0, '127.0.0.1', resolve));
    const netPort = (netHttpServer.address() as any).port;
    const serverUrl = `http://127.0.0.1:${netPort}`;

    const clientA = ioClient(serverUrl, { transports: ['websocket'], forceNew: true });
    const clientB = ioClient(serverUrl, { transports: ['websocket'], forceNew: true });
    await Promise.all([
      new Promise<void>((r) => clientA.on('connect', r)),
      new Promise<void>((r) => clientB.on('connect', r))
    ]);

    const netRoomId = 'Net-Payload-Validation-Room';
    const netRoom = netRm.createRoom(netRoomId);

    const clientAPid = 'usr-net-client-a';
    const clientBPid = 'usr-net-client-b';

    netRm.addPlayerToRoom(netRoomId, {
      id: clientA.id!,
      name: 'NetClientA',
      avatar: '🐱',
      score: 10,
      wins: 1,
      roomId: netRoomId,
      persistentId: clientAPid,
      isOffline: false
    });

    netRm.addPlayerToRoom(netRoomId, {
      id: clientB.id!,
      name: 'NetClientB',
      avatar: '🐶',
      score: 20,
      wins: 2,
      roomId: netRoomId,
      persistentId: clientBPid,
      isOffline: false
    });

    // 4.1 Malformed submit_vote_kick over network
    const netMalformed: any = await new Promise((resolve) => {
      clientA.emit('submit_vote_kick', 'malformed_string_payload', resolve);
    });
    assert(netMalformed.success === false, 'NET-4.1: Malformed string over network rejected with success: false');
    assert(netMalformed.error === 'invalid_payload', 'NET-4.1: Error is invalid_payload');

    // 4.2 Malformed empty targetPlayerId over network
    const netEmptyTarget: any = await new Promise((resolve) => {
      clientA.emit('submit_vote_kick', { targetPlayerId: '   ' }, resolve);
    });
    assert(netEmptyTarget.success === false, 'NET-4.2: Empty targetPlayerId over network rejected with success: false');
    assert(netEmptyTarget.error === 'invalid_payload', 'NET-4.2: Error is invalid_payload');

    // 4.3 Malformed register_drawing_identity over network (should not crash server)
    clientA.emit('register_drawing_identity', null);
    clientA.emit('register_drawing_identity', 12345);
    clientA.emit('register_drawing_identity', { instanceId: '' });
    clientA.emit('unregister_drawing_identity', null);
    clientA.emit('unregister_drawing_identity', []);
    clientA.emit('unregister_drawing_identity', { instanceId: '   ' });

    // Wait 100ms and verify server is responsive and connected
    await new Promise((r) => setTimeout(r, 100));
    assert(clientA.connected, 'NET-4.3: Client A remains connected after malformed drawing identity packets');
    assert(clientB.connected, 'NET-4.4: Client B remains connected');

    // 4.4 Valid submit_vote_kick over network
    const netValidVote: any = await new Promise((resolve) => {
      clientA.emit('submit_vote_kick', { targetPlayerId: clientBPid }, resolve);
    });
    assert(netValidVote.success === true, 'NET-4.5: Valid vote over network succeeds');
    assert(netValidVote.voted === true, 'NET-4.5: Voted is true');
    assert(netRoom.votekicks[clientBPid]?.includes(clientAPid), 'NET-4.5: Room votekicks updated accurately');

    // Teardown network
    clientA.disconnect();
    clientB.disconnect();
    await new Promise<void>((resolve) => netIo.close(() => resolve()));
    await new Promise<void>((resolve) => netHttpServer.close(() => resolve()));
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n====================================================');
  if (allPassed) {
    console.log(`🎉 ALL ${passCount} PAYLOAD VALIDATION TESTS PASSED!`);
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error(`❌ ${failCount} TESTS FAILED (Passed: ${passCount})`);
    console.log('====================================================');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled error running payload validation test suite:', err);
  process.exit(1);
});
