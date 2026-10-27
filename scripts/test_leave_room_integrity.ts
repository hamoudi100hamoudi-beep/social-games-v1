import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { RoomManager, normalizeArabic } from '../server/rooms.js';
import { registerJoinRoomHandler } from '../server/registerJoinRoomHandler.js';
import { registerLeaveRoomHandler, handleLeaveRoom } from '../server/registerLeaveRoomHandler.js';

console.log('====================================================');
console.log('🛡️  PHASE SERVER-AUTH-FIX-3A: LEAVE_ROOM INTEGRITY SUITE');
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

async function runTests() {
  const rm = new RoomManager();

  // -------------------------------------------------------------
  // Test 1: Malformed and Non-Object Payloads Handling
  // -------------------------------------------------------------
  console.log('--- Test 1: Malformed & Non-Object Payloads ---');
  const malformedInputs: any[] = [
    null,
    undefined,
    123,
    'leave_me',
    true,
    false,
    [],
    [1, 2, 3],
    {},
    { roomId: null },
    { roomId: undefined },
    { roomId: 999 },
    { roomId: true },
    { roomId: [] },
    { roomId: {} },
    { wrongKey: 'any-room' }
  ];

  for (let i = 0; i < malformedInputs.length; i++) {
    const payload = malformedInputs[i];
    const roomId = `room-malformed-${i}`;
    const sockId = `sock-malformed-${i}`;
    const pid = `pid-malformed-${i}`;

    rm.createRoom(roomId);
    rm.addPlayerToRoom(roomId, {
      id: sockId,
      name: `Tester_${i}`,
      score: 0,
      avatar: '🧪',
      wins: 0,
      roomId,
      persistentId: pid,
      isOffline: false,
      lastActivity: Date.now()
    });

    const mockSocket = {
      id: sockId,
      leave: () => {}
    };

    let threw = false;
    try {
      handleLeaveRoom(mockSocket, payload, {
        io: { to: () => ({ emit: () => {} }) },
        roomManager: rm
      });
    } catch (e) {
      threw = true;
    }

    assert(!threw, `Test 1.${i + 1}: Payload ${JSON.stringify(payload)} handled safely without throwing`);
    const player = rm.getPlayer(sockId);
    assert(!player || player.roomId === null, `Test 1.${i + 1}: Player roomId cleared`);
    assert(rm.getRoom(roomId) === undefined, `Test 1.${i + 1}: Solo room cleaned up upon exit`);
  }

  // -------------------------------------------------------------
  // Test 2: Spoofed roomId Protection (Cross-room Isolation)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Spoofed roomId Protection ---');
  const roomAId = 'Room-Alpha-Secure';
  const roomBId = 'Room-Beta-Target';
  const roomA = rm.createRoom(roomAId);
  const roomB = rm.createRoom(roomBId);

  const aliceSock = 'sock-alice-a';
  const alicePid = 'pid-alice-a';
  rm.addPlayerToRoom(roomAId, {
    id: aliceSock,
    name: 'Alice',
    score: 10,
    avatar: '👩',
    wins: 1,
    roomId: roomAId,
    persistentId: alicePid,
    isOffline: false,
    lastActivity: Date.now()
  });

  const charlieSock = 'sock-charlie-a';
  const charliePid = 'pid-charlie-a';
  rm.addPlayerToRoom(roomAId, {
    id: charlieSock,
    name: 'Charlie',
    score: 5,
    avatar: '👦',
    wins: 0,
    roomId: roomAId,
    persistentId: charliePid,
    isOffline: false,
    lastActivity: Date.now()
  });

  const bobSock = 'sock-bob-b';
  const bobPid = 'pid-bob-b';
  rm.addPlayerToRoom(roomBId, {
    id: bobSock,
    name: 'Bob',
    score: 50,
    avatar: '👨',
    wins: 3,
    roomId: roomBId,
    persistentId: bobPid,
    isOffline: false,
    lastActivity: Date.now()
  });

  const leftRooms: string[] = [];
  const aliceMockSock = {
    id: aliceSock,
    leave: (r: string) => { leftRooms.push(r); }
  };

  let emittedToB = false;
  let emittedToA = false;
  let emittedLeaveMsg: any = null;

  const mockIo = {
    to: (rId: string) => ({
      emit: (evt: string, msg: any) => {
        if (rId === roomBId) emittedToB = true;
        if (rId === roomAId) {
          emittedToA = true;
          emittedLeaveMsg = msg;
        }
      }
    })
  };

  const initialBetaMsgCount = roomB.chatMessages.length;

  // Alice sends spoofed roomId pointing to Room B
  handleLeaveRoom(aliceMockSock, { roomId: roomBId }, {
    io: mockIo,
    roomManager: rm
  });

  // Verify Alice safely left Room A
  assert(roomA.players.length === 1, 'Test 2.1: Alice removed from Room A (Charlie remains)');
  assert(roomA.players[0].id === charlieSock, 'Test 2.2: Charlie still present in Room A');
  assert(rm.getPlayer(aliceSock)?.roomId === null, 'Test 2.3: Alice player.roomId set to null');
  assert(leftRooms.includes(roomAId), 'Test 2.4: Socket instructed to leave Room A');
  assert(!leftRooms.includes(roomBId), 'Test 2.4b: Socket is NOT instructed to leave spoofed Room B');
  assert(leftRooms.length === 1, 'Test 2.4c: Socket leave was called exactly once for authoritative room');

  // Verify Room B was untouched
  assert(roomB.players.length === 1, 'Test 2.5: Room B player count untouched');
  assert(roomB.players[0].id === bobSock, 'Test 2.6: Bob still in Room B');
  assert(roomB.chatMessages.length === initialBetaMsgCount, 'Test 2.7: No fake leave message in Room B chat');
  assert((emittedToB as boolean) === false, 'Test 2.8: No Socket.IO broadcast sent to Room B');

  // Verify Room A received notification
  assert((emittedToA as boolean) === true, 'Test 2.9: Leave notification sent to Room A');
  assert(emittedLeaveMsg && emittedLeaveMsg.text.includes('Alice غادر الغرفة'), 'Test 2.10: Leave message contains correct player name');

  // -------------------------------------------------------------
  // Test 3: Unregistered or Out-of-Room Socket Safe No-op
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Unregistered Socket Safe No-Op ---');
  let ghostLeft: boolean = false;
  const ghostSock = {
    id: 'sock-unregistered-ghost',
    leave: () => { ghostLeft = true; }
  };

  let ghostThrew = false;
  try {
    handleLeaveRoom(ghostSock, { roomId: roomBId }, {
      io: mockIo,
      roomManager: rm
    });
  } catch (e) {
    ghostThrew = true;
  }
  assert(!ghostThrew, 'Test 3.1: Unregistered socket does not throw');
  assert(!ghostLeft, 'Test 3.2: Unregistered socket does not call leave()');
  assert(roomB.players.length === 1, 'Test 3.3: Room B players unchanged');

  // Registered player with null roomId
  const idlePlayerPid = 'pid-idle-player';
  const idlePlayerSock = 'sock-idle-player';
  (rm as any).players.set(idlePlayerSock, {
    id: idlePlayerSock,
    name: 'IdlePlayer',
    roomId: null,
    score: 0,
    wins: 0,
    persistentId: idlePlayerPid,
    avatar: '💤'
  });

  let idleLeft = false;
  const idleMockSock = {
    id: idlePlayerSock,
    leave: () => { idleLeft = true; }
  };
  handleLeaveRoom(idleMockSock, { roomId: roomBId }, {
    io: mockIo,
    roomManager: rm
  });
  assert(!idleLeft, 'Test 3.4: Player with roomId=null does not call leave()');

  // -------------------------------------------------------------
  // Test 4: Drawer Departure Handling (drawer_left)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Drawer Departure Handling ---');
  const drawRoomId = 'Room-Drawer-Test';
  const drawRoom = rm.createRoom(drawRoomId);
  drawRoom.isFreeDraw = false;

  const drawerPid = 'pid-active-drawer';
  const drawerSock = 'sock-active-drawer';
  rm.addPlayerToRoom(drawRoomId, {
    id: drawerSock,
    name: 'DrawerMaster',
    score: 0,
    avatar: '🎨',
    wins: 0,
    roomId: drawRoomId,
    persistentId: drawerPid,
    isOffline: false,
    lastActivity: Date.now()
  });

  const guesserPid = 'pid-active-guesser';
  const guesserSock = 'sock-active-guesser';
  rm.addPlayerToRoom(drawRoomId, {
    id: guesserSock,
    name: 'GuesserMaster',
    score: 0,
    avatar: '🔍',
    wins: 0,
    roomId: drawRoomId,
    persistentId: guesserPid,
    isOffline: false,
    lastActivity: Date.now()
  });

  drawRoom.gameState.status = 'DRAWING';
  drawRoom.gameState.currentDrawerId = drawerPid;
  drawRoom.gameState.currentWord = 'رمان';
  drawRoom.gameState.correctGuessers = [];

  const drawerMock = {
    id: drawerSock,
    leave: () => {}
  };

  handleLeaveRoom(drawerMock, { roomId: drawRoomId }, {
    io: mockIo,
    roomManager: rm
  });

  assert(drawRoom.players.length === 1, 'Test 4.1: Drawer removed from room players');
  assert((drawRoom.gameState.status as string) === 'ROUND_END', 'Test 4.2: Game transitioned to ROUND_END on drawer exit');
  assert((drawRoom.gameState as any).roundEndReason === 'drawer_left', 'Test 4.3: Round end reason recorded as drawer_left');

  // -------------------------------------------------------------
  // Test 5: Last Player Departure & Memory Cleanup
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Last Player Departure & Cleanup ---');
  const soloRoomId = 'Room-Solo-Test';
  const soloRoom = rm.createRoom(soloRoomId);
  soloRoom.gameState.drawHistory = [{ type: 1 } as any];
  soloRoom.gameState.redoStack = [{ type: 2 } as any];
  soloRoom.chatMessages = [{ id: '1', text: 'hi', type: 'message' } as any];

  const soloSock = 'sock-solo';
  const soloPid = 'pid-solo';
  rm.addPlayerToRoom(soloRoomId, {
    id: soloSock,
    name: 'SoloGuy',
    score: 0,
    avatar: '👤',
    wins: 0,
    roomId: soloRoomId,
    persistentId: soloPid,
    isOffline: false,
    lastActivity: Date.now()
  });

  const soloMock = {
    id: soloSock,
    leave: () => {}
  };

  handleLeaveRoom(soloMock, { roomId: soloRoomId }, {
    io: mockIo,
    roomManager: rm
  });

  assert(rm.getRoom(soloRoomId) === undefined, 'Test 5.1: Room deleted from manager when last player leaves');
  assert(rm.getPlayer(soloSock)?.roomId === null, 'Test 5.2: Player roomId set to null');

  // -------------------------------------------------------------
  // Test 6: Free Draw activeDrawers Cleanup
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Free Draw activeDrawers Cleanup ---');
  const fdRoomId = 'Room-FD-Cleanup';
  const fdRoom = rm.createRoom(fdRoomId);
  fdRoom.isFreeDraw = true;

  const fd1Sock = 'sock-fd-1';
  const fd1Pid = 'pid-fd-1';
  rm.addPlayerToRoom(fdRoomId, {
    id: fd1Sock,
    name: 'FD1',
    score: 0,
    avatar: '🖌️',
    wins: 0,
    roomId: fdRoomId,
    persistentId: fd1Pid,
    isOffline: false,
    lastActivity: Date.now()
  });

  const fd2Sock = 'sock-fd-2';
  const fd2Pid = 'pid-fd-2';
  rm.addPlayerToRoom(fdRoomId, {
    id: fd2Sock,
    name: 'FD2',
    score: 0,
    avatar: '🖌️',
    wins: 0,
    roomId: fdRoomId,
    persistentId: fd2Pid,
    isOffline: false,
    lastActivity: Date.now()
  });

  fdRoom.activeDrawers = [fd1Pid, fd2Pid];

  const fdMock = {
    id: fd1Sock,
    leave: () => {}
  };

  handleLeaveRoom(fdMock, { roomId: fdRoomId }, {
    io: mockIo,
    roomManager: rm
  });

  assert(fdRoom.players.length === 1, 'Test 6.1: Player removed from Free Draw room');
  assert(!fdRoom.activeDrawers.includes(fd1Pid), 'Test 6.2: Exited player removed from activeDrawers');
  assert(fdRoom.activeDrawers.includes(fd2Pid), 'Test 6.3: Remaining player retained in activeDrawers');

  // -------------------------------------------------------------
  // Test 7: Real Network Socket.IO Integration
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Real Socket.IO Network Integration ---');
  const netHttpServer = createServer();
  const netIo = new Server(netHttpServer);
  const netRm = new RoomManager();
  netRm.setIo(netIo);

  netIo.on('connection', (socket) => {
    registerJoinRoomHandler(socket, {
      io: netIo,
      roomManager: netRm,
      getRoomConfig: () => ({ maxPlayers: 5, winningScore: 30, theme: 'General' }),
      getJsonSafeHistory: (h) => h || []
    });
    registerLeaveRoomHandler(socket, {
      io: netIo,
      roomManager: netRm
    });
  });

  await new Promise<void>((resolve) => netHttpServer.listen(0, '127.0.0.1', resolve));
  const port = (netHttpServer.address() as any).port;
  const url = `http://127.0.0.1:${port}`;

  const clientAlpha = ioClient(url, { transports: ['websocket'], forceNew: true });
  const clientBeta = ioClient(url, { transports: ['websocket'], forceNew: true });

  await Promise.all([
    new Promise<void>((res) => clientAlpha.on('connect', res)),
    new Promise<void>((res) => clientBeta.on('connect', res))
  ]);

  const netRoomAlpha = 'Net-Room-Alpha-7';
  const netRoomBeta = 'Net-Room-Beta-7';
  netRm.createRoom(netRoomAlpha);
  netRm.createRoom(netRoomBeta);

  await new Promise((res) => {
    clientAlpha.emit('join_room', {
      roomId: netRoomAlpha,
      nickname: 'NetAlphaPlayer',
      playerId: 'pid-net-alpha',
      reconnectSecret: 'sec-net-alpha-1234'
    }, res);
  });

  await new Promise((res) => {
    clientBeta.emit('join_room', {
      roomId: netRoomBeta,
      nickname: 'NetBetaPlayer',
      playerId: 'pid-net-beta',
      reconnectSecret: 'sec-net-beta-1234'
    }, res);
  });

  const netAlphaRoomObj = netRm.getRoom(netRoomAlpha)!;
  const netBetaRoomObj = netRm.getRoom(netRoomBeta)!;

  assert(netAlphaRoomObj.players.length === 1, 'Test 7.1: Client joined Net-Room-Alpha');
  assert(netBetaRoomObj.players.length === 1, 'Test 7.2: Client joined Net-Room-Beta');

  // Client Alpha emits leave_room spoofing Net-Room-Beta
  clientAlpha.emit('leave_room', { roomId: netRoomBeta });
  await new Promise((r) => setTimeout(r, 100));

  // Verify Net-Room-Beta is completely untouched
  assert(netBetaRoomObj.players.length === 1, 'Test 7.3: Net-Room-Beta players untouched');
  assert(netBetaRoomObj.players[0].persistentId === 'pid-net-beta', 'Test 7.4: NetBetaPlayer still in room');
  const betaSysMsgs = netBetaRoomObj.chatMessages.filter(m => m.type === 'system' && m.text.includes('غادر'));
  assert(betaSysMsgs.length === 0, 'Test 7.5: Zero leave messages in Net-Room-Beta');

  // Verify Client Alpha left Net-Room-Alpha and room was deleted
  assert(netRm.getRoom(netRoomAlpha) === undefined, 'Test 7.6: Net-Room-Alpha cleaned up on departure');

  clientAlpha.disconnect();
  clientBeta.disconnect();
  await new Promise<void>((res) => netIo.close(() => res()));
  await new Promise<void>((res) => netHttpServer.close(() => res()));

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n====================================================');
  if (allPassed) {
    console.log(`🎉 ALL ${passCount} LEAVE_ROOM INTEGRITY TESTS PASSED!`);
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error(`❌ ${failCount} TESTS FAILED (Passed: ${passCount})`);
    console.log('====================================================');
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Unhandled test error:', e);
  process.exit(1);
});
