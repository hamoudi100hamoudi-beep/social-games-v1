import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextData {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextData>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Automatically connects to the current host
    const socketInstance = io(typeof window !== 'undefined' ? window.location.origin : 'https://social-games-v1.onrender.com', {
      autoConnect: true,
      transports: ['websocket'],
      withCredentials: true,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected!', socketInstance.id);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected!');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
