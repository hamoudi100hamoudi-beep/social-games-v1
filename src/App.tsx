import React, { useState } from 'react';
import { useSocket } from './components/SocketProvider';
import GameRoom from './components/GameRoom';
import Lobby from './components/Lobby';

export default function App() {
  const { isConnected } = useSocket();
  const [gameState, setGameState] = useState<'lobby' | 'game'>('lobby');
  const [playerInfo, setPlayerInfo] = useState({ nickname: '', room: '' });

  const handlePlay = (nickname: string, room: string) => {
    setPlayerInfo({ nickname, room });
    setGameState('game');
  };

  return (
    <>
      {gameState === 'lobby' ? (
        <Lobby onPlay={handlePlay} />
      ) : (
        <GameRoom nickname={playerInfo.nickname} room={playerInfo.room} />
      )}
    </>
  );
}
