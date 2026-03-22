// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { Game, PHASES } = require('./GameEngine');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Serve built client in production
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// Game store
const games = new Map();
const socketToGame = new Map(); // socketId -> { gameId, playerId }

function findGameByCode(code) {
  return games.get(code.toUpperCase());
}

function broadcastToGame(game, event, data) {
  for (const [, player] of game.players) {
    io.to(player.socketId).emit(event, data);
  }
}

function broadcastPlayerStates(game) {
  // Send personalized state to each player
  for (const [playerId, player] of game.players) {
    if (player.isHost) {
      io.to(player.socketId).emit('game:state', game.getHostState());
    } else {
      io.to(player.socketId).emit('game:state', game.getPlayerState(playerId));
    }
  }
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // HOST: Create a new game
  socket.on('game:create', ({ question, trueAnswer, version, config }, callback) => {
    const game = new Game({
      hostId: socket.id,
      question,
      trueAnswer,
      version: version || 'A',
      config,
    });
    const hostPlayerId = 'host_' + socket.id.slice(0, 8);
    game.addPlayer(hostPlayerId, 'Host', socket.id, true);
    games.set(game.id, game);
    socketToGame.set(socket.id, { gameId: game.id, playerId: hostPlayerId });

    console.log(`Game created: ${game.id} (Version ${game.version})`);
    callback({ success: true, gameId: game.id, state: game.getHostState() });
  });

  // PLAYER: Join a game
  socket.on('game:join', ({ code, name }, callback) => {
    const game = findGameByCode(code);
    if (!game) return callback({ error: 'Game not found' });
    if (game.phase !== PHASES.LOBBY) return callback({ error: 'Game already in progress' });

    const playerId = 'player_' + socket.id.slice(0, 8);
    game.addPlayer(playerId, name, socket.id, false);
    socketToGame.set(socket.id, { gameId: game.id, playerId });

    console.log(`${name} joined game ${game.id}`);
    broadcastPlayerStates(game);
    callback({ success: true, playerId, state: game.getPlayerState(playerId) });
  });

  // HOST: Add participant for Version B
  socket.on('game:addParticipant', ({ name }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game || game.version !== 'B') return callback({ error: 'Only available in Version B' });
    const participant = game.addHostParticipant(name);
    io.to(socket.id).emit('game:state', game.getHostState());
    callback({ success: true, participant });
  });

  // HOST: Remove participant for Version B
  socket.on('game:removeParticipant', ({ participantId }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game || game.version !== 'B') return callback({ error: 'Only available in Version B' });
    game.removeHostParticipant(participantId);
    io.to(socket.id).emit('game:state', game.getHostState());
    callback({ success: true });
  });

  // HOST: Start the game (show question)
  socket.on('game:start', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    game.startGame();
    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: Start spread auction
  socket.on('game:startAuction', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    game.startSpreadAuction();
    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: Submit spread bid on behalf of a participant (Version B)
  socket.on('spread:submitFor', ({ participantId, width }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game || game.version !== 'B') return callback({ error: 'Only for Version B' });

    const result = game.submitSpread(participantId, parseFloat(width));
    if (result.error) return callback(result);

    io.to(socket.id).emit('game:state', game.getHostState());
    callback({ success: true });
  });

  // PLAYER: Submit spread bid
  socket.on('spread:submit', ({ width }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const result = game.submitSpread(mapping.playerId, parseFloat(width));
    if (result.error) return callback(result);

    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: Close spread auction
  socket.on('spread:close', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const result = game.closeSpreadAuction();
    if (result.error) return callback(result);

    broadcastPlayerStates(game);
    callback({ success: true, result });
  });

  // HOST (Version B) / PLAYER (Version A): Post market (spread winner)
  socket.on('market:post', ({ midPrice }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    // In Version B, the host posts on behalf of the winner
    const posterId = game.version === 'B' ? game.spreadWinner : mapping.playerId;
    const result = game.postMarket(posterId, parseFloat(midPrice));
    if (result.error) return callback(result);

    broadcastPlayerStates(game);
    callback({ success: true, market: result.market });
  });

  // PLAYER: Submit initial trading decision
  socket.on('initial:decide', ({ decision }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const result = game.submitInitialDecision(mapping.playerId, decision);
    if (result.error) return callback(result);

    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: Resolve initial trading (execute all decisions)
  socket.on('initial:resolve', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const fills = game.resolveInitialTrading();
    broadcastPlayerStates(game);
    callback({ success: true, fills });
  });

  // HOST (Version B): Submit initial decisions on behalf of participants
  socket.on('initial:submitAll', ({ decisions }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game || game.version !== 'B') return callback({ error: 'Only available in Version B' });

    // decisions is an object: { participantId: 'buy' | 'sell' | 'pass' }
    for (const [pid, decision] of Object.entries(decisions)) {
      game.submitInitialDecision(pid, decision);
    }

    const fills = game.resolveInitialTrading();
    io.to(socket.id).emit('game:state', game.getHostState());
    callback({ success: true, fills });
  });

  // PLAYER: Submit order (Version A)
  socket.on('order:submit', ({ side, price, quantity }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const result = game.submitOrder(mapping.playerId, side, price, quantity || 1);
    if (result.error) return callback(result);

    broadcastPlayerStates(game);
    callback({ success: true, fills: result.fills });
  });

  // PLAYER: Cancel order (Version A)
  socket.on('order:cancel', ({ orderId }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const success = game.cancelOrder(orderId, mapping.playerId);
    broadcastPlayerStates(game);
    callback({ success });
  });

  // PLAYER: Cancel all orders (Version A)
  socket.on('order:cancelAll', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    game.cancelAllOrders(mapping.playerId);
    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: Enter trade manually (Version B)
  socket.on('trade:enter', ({ buyerId, sellerId, price, quantity }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const result = game.enterTrade(buyerId, sellerId, parseFloat(price), parseInt(quantity) || 1);
    if (result.error) return callback(result);

    io.to(socket.id).emit('game:state', game.getHostState());
    callback({ success: true, trade: result.trade });
  });

  // HOST: Undo last trade (Version B)
  socket.on('trade:undo', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const result = game.undoLastTrade();
    if (result.error) return callback(result);

    io.to(socket.id).emit('game:state', game.getHostState());
    callback({ success: true, undone: result.undone });
  });

  // HOST: Push information update
  socket.on('info:push', ({ text }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const update = game.pushInfoUpdate(text);
    broadcastPlayerStates(game);
    callback({ success: true, update });
  });

  // HOST: Update displayed market (Version B)
  socket.on('market:update', ({ bid, ask }, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    game.displayedMarket = {
      bid: bid !== null && bid !== '' ? parseFloat(bid) : null,
      ask: ask !== null && ask !== '' ? parseFloat(ask) : null,
    };
    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: Pause
  socket.on('game:pause', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    game.pause();
    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: Resume
  socket.on('game:resume', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    game.resume();
    broadcastPlayerStates(game);
    callback({ success: true });
  });

  // HOST: End game and settle
  socket.on('game:end', (_, callback) => {
    const mapping = socketToGame.get(socket.id);
    if (!mapping) return callback({ error: 'Not in a game' });
    const game = games.get(mapping.gameId);
    if (!game) return callback({ error: 'Game not found' });

    const result = game.settle();
    broadcastPlayerStates(game);
    callback({ success: true, result });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    const mapping = socketToGame.get(socket.id);
    if (mapping) {
      const game = games.get(mapping.gameId);
      if (game) {
        const player = game.players.get(mapping.playerId);
        if (player) {
          console.log(`${player.name} disconnected from game ${game.id}`);
          // Don't remove player - they might reconnect.
          // Just mark them as disconnected
          player.connected = false;
        }
      }
      socketToGame.delete(socket.id);
    }
  });

  // Request current state (for reconnection or refresh)
  socket.on('game:requestState', ({ gameId, playerId }, callback) => {
    const game = games.get(gameId);
    if (!game) return callback({ error: 'Game not found' });
    const player = game.players.get(playerId);
    if (!player) return callback({ error: 'Player not found in game' });

    // Update socket mapping
    player.socketId = socket.id;
    player.connected = true;
    socketToGame.set(socket.id, { gameId, playerId });

    if (player.isHost) {
      callback({ success: true, state: game.getHostState() });
    } else {
      callback({ success: true, state: game.getPlayerState(playerId) });
    }
  });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`HFAC Market Making server running on port ${PORT}`);
});
