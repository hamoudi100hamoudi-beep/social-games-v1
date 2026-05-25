import React, { useState } from 'react';
import { useSocket } from './components/SocketProvider';
import GameRoom from './components/GameRoom';
import Lobby from './components/Lobby';

export default function App() {
  const { isConnected } = useSocket();
  
  const [playerInfo, setPlayerInfo] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedNickname = localStorage.getItem('gartic_player_nickname') || '';
      const savedRoom = localStorage.getItem('gartic_player_room') || '';
      const savedAvatar = localStorage.getItem('gartic_player_avatar') || '';
      return { nickname: savedNickname, room: savedRoom, avatar: savedAvatar };
    }
    return { nickname: '', room: '', avatar: '' };
  });

  const [gameState, setGameState] = useState<'lobby' | 'game'>(() => {
    if (typeof window !== 'undefined') {
      const savedRoom = localStorage.getItem('gartic_player_room');
      const savedNickname = localStorage.getItem('gartic_player_nickname');
      if (savedRoom && savedNickname) {
        return 'game';
      }
    }
    return 'lobby';
  });

  const handlePlay = (nickname: string, room: string, avatar: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gartic_player_nickname', nickname);
      localStorage.setItem('gartic_player_room', room);
      localStorage.setItem('gartic_player_avatar', avatar);
    }
    setPlayerInfo({ nickname, room, avatar });
    setGameState('game');
  };

  const handleLeaveRoom = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gartic_player_room');
    }
    setGameState('lobby');
  };

  return (
    <>
      {gameState === 'lobby' ? (
        <Lobby onPlay={handlePlay} />
      ) : (
        <GameRoom nickname={playerInfo.nickname} room={playerInfo.room} avatar={playerInfo.avatar} onLeave={handleLeaveRoom} />
      )}
    </>
  );
}
