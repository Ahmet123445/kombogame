// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { server, io as ioServer } from './index.js';

describe('Socket Server Tests', () => {
  let clientSocket;
  let clientSocket2;
  const port = 3001; 

  beforeAll(() => {
    return new Promise((resolve) => {
      server.listen(port, () => {
        resolve();
      });
    });
  });

  afterAll(() => {
    ioServer.close();
  });

  beforeEach(() => {
    return new Promise((resolve) => {
        clientSocket = ioClient(`http://localhost:${port}`, {
            forceNew: true,
            transports: ['websocket'] // Force websocket to avoid polling delays
        });
        clientSocket2 = ioClient(`http://localhost:${port}`, {
            forceNew: true,
            transports: ['websocket']
        });

        let connected = 0;
        const onConnect = () => {
            connected++;
            if(connected === 2) resolve();
        }
        clientSocket.on('connect', onConnect);
        clientSocket2.on('connect', onConnect);
    });
  });

  afterEach(() => {
    clientSocket.disconnect();
    clientSocket2.disconnect();
  });

  it('should allow users to join a room', () => new Promise((resolve) => {
    const roomId = 'room-1';
    clientSocket.emit('join-room', { roomId, username: 'User1' });
    clientSocket.on('all-users', (users) => {
      expect(Array.isArray(users)).toBe(true);
      resolve();
    });
  }));

  it('should sync messages between users in the same room', () => new Promise((resolve, reject) => {
    const roomId = 'chat-room-1';
    let joinedCount = 0;

    const onJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
             clientSocket.emit('send-message', { 
                roomId, 
                message: 'Merhaba Dünya', 
                username: 'UserA' 
            });
        }
    };

    clientSocket.on('message-history', onJoined);
    clientSocket2.on('message-history', onJoined);

    clientSocket.emit('join-room', { roomId, username: 'UserA' });
    clientSocket2.emit('join-room', { roomId, username: 'UserB' });

    clientSocket2.on('receive-message', (data) => {
        try {
            expect(data.message).toBe('Merhaba Dünya');
            expect(data.username).toBe('UserA');
            resolve();
        } catch (error) {
            reject(error);
        }
    });
  }));
});
