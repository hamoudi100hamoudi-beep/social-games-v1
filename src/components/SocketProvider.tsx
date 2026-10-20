import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  socketId: string | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  socketId: null
});

export const useSocket = () => useContext(SocketContext);

const socketInstance: Socket = io(typeof window !== 'undefined' ? window.location.origin : 'https://social-games-v1.onrender.com', {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket'],
  withCredentials: true,
  parser: customParser
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(socketInstance.connected);
  const [socketId, setSocketId] = useState(socketInstance.id || null);

  useEffect(() => {
    setIsConnected(socketInstance.connected);
    setSocketId(socketInstance.id || null);

    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socketInstance.id || null);
      console.log('[Socket] Connected!', socketInstance.id);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setSocketId(null);
      console.log('[Socket] Disconnected!');
    };

    const handleForceDisconnect = (data: any) => {
      console.warn('[Socket] Force disconnected by server:', data);
      socketInstance.disconnect();
    };

    socketInstance.on('connect', handleConnect);
    socketInstance.on('disconnect', handleDisconnect);
    socketInstance.on('force_disconnect', handleForceDisconnect);

    return () => {
      socketInstance.off('connect', handleConnect);
      socketInstance.off('disconnect', handleDisconnect);
      socketInstance.off('force_disconnect', handleForceDisconnect);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketInstance, isConnected, socketId }}>
      {children}
    </SocketContext.Provider>
  );
};
