import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextData {
  socket: Socket | null;
  isConnected: boolean;
  socketId: string | null;
}

const SocketContext = createContext<SocketContextData>({
  socket: null,
  isConnected: false,
  socketId: null,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    // Automatically connects to the current host
    const socketInstance = io(typeof window !== 'undefined' ? window.location.origin : 'https://social-games-v1.onrender.com', {
      autoConnect: true,
      transports: ['websocket'],
      withCredentials: true,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      setSocketId(socketInstance.id || null);
      console.log('[Socket] Connected!', socketInstance.id);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      setSocketId(null);
      console.log('[Socket] Disconnected!');
    });

    socketInstance.on('force_disconnect', (data) => {
      console.warn('[Socket] Force disconnected by server:', data);
      socketInstance.disconnect(); // prevent auto-reconnect
    });

    setSocket(socketInstance);

    // Prompt proactive reconnect immediately when browser fires "online" event
    const handleOnline = () => {
      console.log('[Socket] Browser online event! Forcing connection check...');
      if (socketInstance && !socketInstance.connected) {
        socketInstance.connect();
      }
    };

    // Low-latency Heartbeat: checks connection status and forces socket connect if browser online but socket is zombie
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && navigator.onLine && socketInstance && !socketInstance.connected) {
        console.log('[Socket] Heartbeat forced reconnection...');
        socketInstance.connect();
      }
    }, 2000);

    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, socketId }}>
      {children}
    </SocketContext.Provider>
  );
};
