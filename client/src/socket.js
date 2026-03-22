import { io } from 'socket.io-client';

const URL = import.meta.env.PROD ? '/' : 'http://localhost:3001';

export const socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});

export function emit(event, data) {
  return new Promise((resolve) => {
    socket.emit(event, data, (response) => {
      resolve(response);
    });
  });
}
