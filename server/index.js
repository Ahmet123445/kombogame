import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;

// Room State Management
const rooms = {};
const roomMessages = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = [];
      roomMessages[roomId] = [];
    }

    const user = { id: socket.id, username, isMuted: false, isScreenSharing: false };
    rooms[roomId].push(user);

    const otherUsers = rooms[roomId].filter(u => u.id !== socket.id);

    socket.emit('all-users', otherUsers);
    
    socket.emit('message-history', roomMessages[roomId]);

    // Orijinal kodda buradaki 'user-joined' (signal: null) yayını,
    // WebRTC initiator mantığıyla çakışıp duplicate peer yaratıyordu.
    // Yeni katılan kullanıcı zaten 'all-users' alıp initiator oluyor.
    // Diğer kullanıcılar sinyal gelince 'user-joined' (line 47) tetiklenmesiyle haberdar olacak.

    console.log(`${username} joined room ${roomId}`);
  });

  socket.on('sending-signal', payload => {
    io.to(payload.userToSignal).emit('user-joined', { signal: payload.signal, callerId: payload.callerId, username: payload.username });
  });

  socket.on('returning-signal', payload => {
    io.to(payload.callerId).emit('receiving-returned-signal', { signal: payload.signal, id: socket.id });
  });

  socket.on('send-message', ({ roomId, message, type = 'text', fileData = null, username }) => {
    const msgObj = { userId: socket.id, username, message, type, fileData, timestamp: new Date() };
    
    if (roomMessages[roomId]) {
        roomMessages[roomId].push(msgObj);
        if (roomMessages[roomId].length > 50) roomMessages[roomId].shift();
    }

    io.to(roomId).emit('receive-message', msgObj);
  });

  socket.on('toggle-audio', ({ roomId, isMuted }) => {
    const room = rooms[roomId];
    if(room) {
      const user = room.find(u => u.id === socket.id);
      if(user) user.isMuted = isMuted;
      socket.to(roomId).emit('user-toggled-audio', { userId: socket.id, isMuted });
    }
  });

  socket.on('toggle-screen', ({ roomId, isScreenSharing }) => {
      const room = rooms[roomId];
      if(room) {
        const user = room.find(u => u.id === socket.id);
        if(user) user.isScreenSharing = isScreenSharing;
      }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in rooms) {
      const index = rooms[roomId].findIndex(u => u.id === socket.id);
      if (index !== -1) {
        rooms[roomId].splice(index, 1);
        io.to(roomId).emit('user-left', socket.id);
        
        if (rooms[roomId].length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export { io, server, app };
