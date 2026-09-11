import React, { useState, useEffect } from 'react';
import { useSocket } from './components/SocketProvider';
import GameRoom from './components/GameRoom';
import ExperimentalGameRoom from './components/experimental/ExperimentalGameRoom';
import Lobby from './components/Lobby';
import { safeLocalStorage } from './utils/storage';
import { soundManager } from './utils/soundManager';
import { preloadGameSprites } from './utils/preloadAssets';
import { getRoomConfig } from './types/game';

export default function App() {
  const { isConnected } = useSocket();

  useEffect(() => {
    // Load all pre-defined sounds and game sprites immediately
    soundManager.loadAll();
    preloadGameSprites();

    // 🔊 Unlock audio context on first user interaction for iOS Safari compatibility
    const handleInteraction = () => {
      soundManager.unlock();
      
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };

    document.addEventListener('click', handleInteraction, { passive: true });
    document.addEventListener('touchstart', handleInteraction, { passive: true });

    // 🔊 Global Button Click Sound Listener
    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        soundManager.play('buttonClick');
      }
    };
    document.addEventListener('click', handleGlobalClick, { passive: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
      document.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  
  const [playerInfo, setPlayerInfo] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedNickname = safeLocalStorage.getItem('gartic_player_nickname') || '';
      const savedRoom = safeLocalStorage.getItem('gartic_player_room') || '';
      const savedAvatar = safeLocalStorage.getItem('gartic_player_avatar') || '';
      return { nickname: savedNickname, room: savedRoom, avatar: savedAvatar };
    }
    return { nickname: '', room: '', avatar: '' };
  });

  const [gameState, setGameState] = useState<'lobby' | 'game'>(() => {
    if (typeof window !== 'undefined') {
      const savedRoom = safeLocalStorage.getItem('gartic_player_room');
      const savedNickname = safeLocalStorage.getItem('gartic_player_nickname');
      if (savedRoom && savedNickname) {
        return 'game';
      }
    }
    return 'lobby';
  });

  const [justJoined, setJustJoined] = useState(false);

  const handlePlay = (nickname: string, room: string, avatar: string) => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.setItem('gartic_player_nickname', nickname);
      safeLocalStorage.setItem('gartic_player_room', room);
      safeLocalStorage.setItem('gartic_player_avatar', avatar);
    }
    setPlayerInfo({ nickname, room, avatar });
    setJustJoined(true);
    setGameState('game');
  };

  const handleLeaveRoom = () => {
    if (typeof window !== 'undefined') {
      safeLocalStorage.removeItem('gartic_player_room');
    }
    setJustJoined(false);
    setGameState('lobby');
  };

  return (
    <>
      {/* Invisible GPU texture pre-warmer to eliminate any first-render delay for sprites */}
      <div className="fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <img src="/exit.webp" decoding="sync" loading="eager" alt="" />
        <img src="/afk_warning.webp" decoding="sync" loading="eager" alt="" />
      </div>

      {gameState === 'lobby' ? (
        <Lobby onPlay={handlePlay} />
      ) : getRoomConfig(playerInfo.room).isExperimental ? (
        <ExperimentalGameRoom 
          nickname={playerInfo.nickname} 
          room={playerInfo.room} 
          avatar={playerInfo.avatar} 
          justJoined={justJoined}
          onLeave={handleLeaveRoom} 
        />
      ) : (
        <GameRoom 
          nickname={playerInfo.nickname} 
          room={playerInfo.room} 
          avatar={playerInfo.avatar} 
          justJoined={justJoined}
          onLeave={handleLeaveRoom} 
        />
      )}
    </>
  );
}
