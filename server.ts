import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const httpServer = createServer(app);
  // Setup Socket.io
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: Date.now() });
  });

  // Socket.io Handlers
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    
    // Relay drawing events to other clients in the same room (if we had rooms), for now broadcast to all
    socket.on('draw_start', (data) => {
      io.emit('draw_start', data);
    });
    
    socket.on('draw_move', (data) => {
      io.emit('draw_move', data);
    });
    
    socket.on('draw_end', (data) => {
      io.emit('draw_end', data);
    });

    socket.on('draw_action', (data) => {
      io.emit('draw_action', data);
    });

    socket.on('draw_clear', (data) => {
      io.emit('draw_clear', data);
    });

    socket.on('draw_cancel', (data) => {
      io.emit('draw_cancel', data);
    });

    socket.on('draw_undo', (data) => {
      io.emit('draw_undo', data);
    });

    socket.on('draw_redo', (data) => {
      io.emit('draw_redo', data);
    });
    
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static files serving
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
