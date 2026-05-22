import React, { useState } from 'react';
import { useSocket } from './components/SocketProvider';
import GameRoom from './components/GameRoom';
import Lobby from './components/Lobby';

export default function App() {
  const { isConnected } = useSocket();
  const [gameState, setGameState] = useState<'lobby' | 'game'>('lobby');
  const [playerInfo, setPlayerInfo] = useState({ nickname: '', room: '', avatar: '' });

  const handlePlay = (nickname: string, room: string, avatar: string) => {
    setPlayerInfo({ nickname, room, avatar });
    setGameState('game');
  };

  return (
    <>
      {gameState === 'lobby' ? (
        <Lobby onPlay={handlePlay} />
      ) : (
        <GameRoom nickname={playerInfo.nickname} room={playerInfo.room} avatar={playerInfo.avatar} onLeave={() => setGameState('lobby')} />
      )}
    </>
  );
}
