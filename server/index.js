const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Room State Management
const rooms = {};
const roomMessages = {}; // Mesaj geçmişi için

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    
    // Initialize room if not exists
    if (!rooms[roomId]) {
      rooms[roomId] = [];
      roomMessages[roomId] = []; // Odaya ait mesaj geçmişini başlat
    }

    // Add user to room
    const user = { id: socket.id, username, isMuted: false, isScreenSharing: false };
    rooms[roomId].push(user);

    // Get other users in the room
    const otherUsers = rooms[roomId].filter(u => u.id !== socket.id);

    // Send existing users to the new joiner
    socket.emit('all-users', otherUsers);
    
    // Send message history to the new joiner
    socket.emit('message-history', roomMessages[roomId]);

    // Notify others
    socket.to(roomId).emit('user-joined', { signal: null, callerId: socket.id, username });

    console.log(`${username} joined room ${roomId}`);
  });

  // Signaling for WebRTC (Aynen kalıyor)
  socket.on('sending-signal', payload => {
    io.to(payload.userToSignal).emit('user-joined', { signal: payload.signal, callerId: payload.callerId, username: payload.username });
  });

  socket.on('returning-signal', payload => {
    io.to(payload.callerId).emit('receiving-returned-signal', { signal: payload.signal, id: socket.id });
  });

  // Chat Message (Görsel ve Dosya desteği ile)
  socket.on('send-message', ({ roomId, message, type = 'text', fileData = null, username }) => {
    const msgObj = { userId: socket.id, username, message, type, fileData, timestamp: new Date() };
    
    // Geçmişe kaydet (Son 50 mesajı tutalım ki RAM şişmesin)
    if (roomMessages[roomId]) {
        roomMessages[roomId].push(msgObj);
        if (roomMessages[roomId].length > 50) roomMessages[roomId].shift();
    }

    io.to(roomId).emit('receive-message', msgObj);
  });

  // User State Updates
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
        // Logic handled mostly frontend via streams, but good to sync state
      }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from rooms
    for (const roomId in rooms) {
      const index = rooms[roomId].findIndex(u => u.id === socket.id);
      if (index !== -1) {
        const user = rooms[roomId][index];
        rooms[roomId].splice(index, 1);
        io.to(roomId).emit('user-left', socket.id);
        
        // Clean up empty rooms
        if (rooms[roomId].length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
