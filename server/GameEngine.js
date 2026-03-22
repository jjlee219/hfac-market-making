// server/GameEngine.js
// Core game state machine and logic for both Version A and Version B

const { v4: uuidv4 } = require('uuid');

const PHASES = {
  LOBBY: 'LOBBY',
  QUESTION: 'QUESTION',
  SPREAD_AUCTION: 'SPREAD_AUCTION',
  MARKET_POSTING: 'MARKET_POSTING',
  INITIAL_TRADING: 'INITIAL_TRADING',
  ACTIVE_TRADING: 'ACTIVE_TRADING',
  PAUSED: 'PAUSED',
  SETTLEMENT: 'SETTLEMENT',
};

class OrderBook {
  constructor(tickSize = 1) {
    this.bids = []; // sorted desc by price, then asc by time
    this.asks = []; // sorted asc by price, then asc by time
    this.tickSize = tickSize;
    this.trades = [];
  }

  roundPrice(price) {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  addOrder(order) {
    order.price = this.roundPrice(order.price);
    order.id = uuidv4();
    order.timestamp = Date.now();
    order.remainingQty = order.quantity;

    const fills = [];

    if (order.side === 'buy') {
      // Match against asks
      while (order.remainingQty > 0 && this.asks.length > 0) {
        const bestAsk = this.asks[0];
        if (order.price >= bestAsk.price) {
          const fillQty = Math.min(order.remainingQty, bestAsk.remainingQty);
          const fillPrice = bestAsk.price; // resting order price
          fills.push({
            id: uuidv4(),
            buyerId: order.playerId,
            sellerId: bestAsk.playerId,
            price: fillPrice,
            quantity: fillQty,
            timestamp: Date.now(),
            aggressorSide: 'buy',
          });
          order.remainingQty -= fillQty;
          bestAsk.remainingQty -= fillQty;
          if (bestAsk.remainingQty <= 0) {
            this.asks.shift();
          }
        } else {
          break;
        }
      }
      // Rest remaining quantity on the book
      if (order.remainingQty > 0) {
        this.bids.push(order);
        this.bids.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
      }
    } else {
      // Match against bids
      while (order.remainingQty > 0 && this.bids.length > 0) {
        const bestBid = this.bids[0];
        if (order.price <= bestBid.price) {
          const fillQty = Math.min(order.remainingQty, bestBid.remainingQty);
          const fillPrice = bestBid.price; // resting order price
          fills.push({
            id: uuidv4(),
            buyerId: bestBid.playerId,
            sellerId: order.playerId,
            price: fillPrice,
            quantity: fillQty,
            timestamp: Date.now(),
            aggressorSide: 'sell',
          });
          order.remainingQty -= fillQty;
          bestBid.remainingQty -= fillQty;
          if (bestBid.remainingQty <= 0) {
            this.bids.shift();
          }
        } else {
          break;
        }
      }
      if (order.remainingQty > 0) {
        this.asks.push(order);
        this.asks.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
      }
    }

    this.trades.push(...fills);
    return fills;
  }

  cancelOrder(orderId, playerId) {
    let idx = this.bids.findIndex(o => o.id === orderId && o.playerId === playerId);
    if (idx !== -1) {
      this.bids.splice(idx, 1);
      return true;
    }
    idx = this.asks.findIndex(o => o.id === orderId && o.playerId === playerId);
    if (idx !== -1) {
      this.asks.splice(idx, 1);
      return true;
    }
    return false;
  }

  cancelAllForPlayer(playerId) {
    this.bids = this.bids.filter(o => o.playerId !== playerId);
    this.asks = this.asks.filter(o => o.playerId !== playerId);
  }

  getTopOfBook() {
    return {
      bestBid: this.bids.length > 0 ? this.bids[0].price : null,
      bestAsk: this.asks.length > 0 ? this.asks[0].price : null,
      bidDepth: this.bids.reduce((s, o) => s + o.remainingQty, 0),
      askDepth: this.asks.reduce((s, o) => s + o.remainingQty, 0),
    };
  }

  getBookSnapshot(levels = 5) {
    const bidLevels = {};
    for (const o of this.bids) {
      if (!bidLevels[o.price]) bidLevels[o.price] = { price: o.price, quantity: 0, orders: 0 };
      bidLevels[o.price].quantity += o.remainingQty;
      bidLevels[o.price].orders += 1;
    }
    const askLevels = {};
    for (const o of this.asks) {
      if (!askLevels[o.price]) askLevels[o.price] = { price: o.price, quantity: 0, orders: 0 };
      askLevels[o.price].quantity += o.remainingQty;
      askLevels[o.price].orders += 1;
    }
    return {
      bids: Object.values(bidLevels).sort((a, b) => b.price - a.price).slice(0, levels),
      asks: Object.values(askLevels).sort((a, b) => a.price - b.price).slice(0, levels),
    };
  }

  getPlayerOrders(playerId) {
    const playerBids = this.bids.filter(o => o.playerId === playerId);
    const playerAsks = this.asks.filter(o => o.playerId === playerId);
    return [...playerBids, ...playerAsks];
  }
}

class Game {
  constructor({ hostId, question, trueAnswer, version, config = {} }) {
    this.id = this.generateCode();
    this.hostId = hostId;
    this.question = question;
    this.trueAnswer = parseFloat(trueAnswer);
    this.version = version; // 'A' or 'B'
    this.phase = PHASES.LOBBY;
    this.previousPhase = null; // for pause/resume
    this.createdAt = Date.now();

    // Config
    this.config = {
      positionLimit: config.positionLimit || 7,
      tickSize: config.tickSize || 1,
      timerSeconds: config.timerSeconds || null,
      ...config,
    };

    // Players
    this.players = new Map(); // id -> { id, name, socketId, isHost }

    // Spread auction
    this.spreadBids = new Map(); // playerId -> { width, timestamp }
    this.spreadWinner = null;
    this.auctionSpread = null;

    // Market posting
    this.initialMarket = null; // { mid, bid, ask, makerId }

    // Initial trading decisions
    this.initialDecisions = new Map(); // playerId -> 'buy' | 'sell' | 'pass'

    // Position tracking
    this.positions = new Map(); // playerId -> { netPosition, trades: [], totalBought, totalSold, avgBuyPrice, avgSellPrice }

    // Trade tape
    this.trades = [];

    // Order book (Version A only)
    this.orderBook = version === 'A' ? new OrderBook(this.config.tickSize) : null;

    // Information updates
    this.infoUpdates = [];

    // Version B manual market display
    this.displayedMarket = { bid: null, ask: null };

    // Timer
    this.timer = null;
    this.timerEnd = null;

    // Participants added by host (Version B)
    this.hostParticipants = version === 'B' ? [] : null;
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  addPlayer(id, name, socketId, isHost = false) {
    this.players.set(id, { id, name, socketId, isHost });
    if (!this.positions.has(id)) {
      this.positions.set(id, {
        netPosition: 0,
        trades: [],
        totalBought: 0,
        totalSold: 0,
        avgBuyPrice: 0,
        avgSellPrice: 0,
      });
    }
  }

  // Version B: host adds participant names manually
  addHostParticipant(name) {
    const id = 'p_' + uuidv4().slice(0, 8);
    this.hostParticipants.push({ id, name });
    this.positions.set(id, {
      netPosition: 0,
      trades: [],
      totalBought: 0,
      totalSold: 0,
      avgBuyPrice: 0,
      avgSellPrice: 0,
    });
    return { id, name };
  }

  removeHostParticipant(participantId) {
    this.hostParticipants = this.hostParticipants.filter(p => p.id !== participantId);
    this.positions.delete(participantId);
  }

  startGame() {
    this.phase = PHASES.QUESTION;
  }

  startSpreadAuction() {
    this.phase = PHASES.SPREAD_AUCTION;
    this.spreadBids.clear();
  }

  submitSpread(playerId, width) {
    if (this.phase !== PHASES.SPREAD_AUCTION) return { error: 'Not in spread auction phase' };
    if (width <= 0) return { error: 'Spread must be positive' };
    this.spreadBids.set(playerId, { width, timestamp: Date.now() });
    return { success: true };
  }

  closeSpreadAuction() {
    if (this.spreadBids.size === 0) return { error: 'No spread bids submitted' };

    let winner = null;
    let tightestSpread = Infinity;

    for (const [playerId, bid] of this.spreadBids) {
      if (bid.width < tightestSpread || (bid.width === tightestSpread && bid.timestamp < winner?.timestamp)) {
        tightestSpread = bid.width;
        winner = { playerId, ...bid };
      }
    }

    this.spreadWinner = winner.playerId;
    this.auctionSpread = tightestSpread;
    this.phase = PHASES.MARKET_POSTING;

    return {
      winnerId: winner.playerId,
      winnerName: this.getPlayerName(winner.playerId),
      spread: tightestSpread,
      allBids: Array.from(this.spreadBids.entries()).map(([id, b]) => ({
        playerId: id,
        name: this.getPlayerName(id),
        width: b.width,
      })).sort((a, b) => a.width - b.width),
    };
  }

  postMarket(playerId, midPrice) {
    if (playerId !== this.spreadWinner) return { error: 'Only the auction winner can post the market' };
    midPrice = parseFloat(midPrice);
    const halfSpread = this.auctionSpread / 2;
    this.initialMarket = {
      mid: midPrice,
      bid: midPrice - halfSpread,
      ask: midPrice + halfSpread,
      makerId: playerId,
    };
    this.phase = PHASES.INITIAL_TRADING;
    this.initialDecisions.clear();
    return { market: this.initialMarket };
  }

  submitInitialDecision(playerId, decision) {
    if (playerId === this.spreadWinner) return { error: 'Market-maker cannot trade in initial round' };
    if (!['buy', 'sell', 'pass'].includes(decision)) return { error: 'Invalid decision' };
    this.initialDecisions.set(playerId, decision);
    return { success: true };
  }

  resolveInitialTrading() {
    const fills = [];
    const makerId = this.initialMarket.makerId;

    for (const [playerId, decision] of this.initialDecisions) {
      if (decision === 'pass') continue;

      const price = decision === 'buy' ? this.initialMarket.ask : this.initialMarket.bid;
      const trade = {
        id: uuidv4(),
        buyerId: decision === 'buy' ? playerId : makerId,
        sellerId: decision === 'sell' ? playerId : makerId,
        price,
        quantity: 1,
        timestamp: Date.now(),
        phase: 'initial',
      };

      this.recordTrade(trade);
      fills.push(trade);
    }

    this.phase = PHASES.ACTIVE_TRADING;
    return fills;
  }

  recordTrade(trade) {
    this.trades.push(trade);

    // Update buyer position
    const buyerPos = this.positions.get(trade.buyerId);
    if (buyerPos) {
      buyerPos.netPosition += trade.quantity;
      buyerPos.totalBought += trade.quantity;
      // Recalc avg buy price
      const totalBuyCost = buyerPos.trades
        .filter(t => t.side === 'buy')
        .reduce((s, t) => s + t.price * t.quantity, 0) + trade.price * trade.quantity;
      buyerPos.avgBuyPrice = totalBuyCost / buyerPos.totalBought;
      buyerPos.trades.push({ ...trade, side: 'buy' });
    }

    // Update seller position
    const sellerPos = this.positions.get(trade.sellerId);
    if (sellerPos) {
      sellerPos.netPosition -= trade.quantity;
      sellerPos.totalSold += trade.quantity;
      const totalSellRevenue = sellerPos.trades
        .filter(t => t.side === 'sell')
        .reduce((s, t) => s + t.price * t.quantity, 0) + trade.price * trade.quantity;
      sellerPos.avgSellPrice = totalSellRevenue / sellerPos.totalSold;
      sellerPos.trades.push({ ...trade, side: 'sell' });
    }
  }

  // Version A: submit order to order book
  submitOrder(playerId, side, price, quantity) {
    if (this.version !== 'A') return { error: 'Order book only available in Version A' };
    if (this.phase !== PHASES.ACTIVE_TRADING) return { error: 'Not in active trading phase' };

    // Check position limits
    const pos = this.positions.get(playerId);
    if (!pos) return { error: 'Player not found' };

    const projectedPosition = side === 'buy'
      ? pos.netPosition + quantity
      : pos.netPosition - quantity;

    if (Math.abs(projectedPosition) > this.config.positionLimit) {
      return { error: `Position limit of ±${this.config.positionLimit} would be exceeded` };
    }

    const fills = this.orderBook.addOrder({
      playerId,
      side,
      price: parseFloat(price),
      quantity: parseInt(quantity),
    });

    // Record fills
    for (const fill of fills) {
      fill.phase = 'active';
      this.recordTrade(fill);
    }

    return { fills, orderId: fills.length === 0 ? 'resting' : null };
  }

  cancelOrder(orderId, playerId) {
    if (this.version !== 'A') return { error: 'Order book only available in Version A' };
    return this.orderBook.cancelOrder(orderId, playerId);
  }

  cancelAllOrders(playerId) {
    if (this.version !== 'A') return { error: 'Order book only available in Version A' };
    this.orderBook.cancelAllForPlayer(playerId);
    return { success: true };
  }

  // Version B: host enters a trade manually
  enterTrade(buyerId, sellerId, price, quantity) {
    if (this.version !== 'B') return { error: 'Manual trade entry only in Version B' };

    price = parseFloat(price);
    quantity = parseInt(quantity) || 1;

    // Check position limits
    const buyerPos = this.positions.get(buyerId);
    const sellerPos = this.positions.get(sellerId);
    if (!buyerPos || !sellerPos) return { error: 'Player not found' };

    if (Math.abs(buyerPos.netPosition + quantity) > this.config.positionLimit) {
      return { error: `Buyer would exceed position limit of ±${this.config.positionLimit}` };
    }
    if (Math.abs(sellerPos.netPosition - quantity) > this.config.positionLimit) {
      return { error: `Seller would exceed position limit of ±${this.config.positionLimit}` };
    }

    const trade = {
      id: uuidv4(),
      buyerId,
      sellerId,
      price,
      quantity,
      timestamp: Date.now(),
      phase: 'active',
    };

    this.recordTrade(trade);
    return { trade };
  }

  undoLastTrade() {
    if (this.trades.length === 0) return { error: 'No trades to undo' };

    const trade = this.trades.pop();

    // Reverse buyer position
    const buyerPos = this.positions.get(trade.buyerId);
    if (buyerPos) {
      buyerPos.netPosition -= trade.quantity;
      buyerPos.totalBought -= trade.quantity;
      buyerPos.trades = buyerPos.trades.filter(t => t.id !== trade.id);
      if (buyerPos.totalBought > 0) {
        const totalBuyCost = buyerPos.trades
          .filter(t => t.side === 'buy')
          .reduce((s, t) => s + t.price * t.quantity, 0);
        buyerPos.avgBuyPrice = totalBuyCost / buyerPos.totalBought;
      } else {
        buyerPos.avgBuyPrice = 0;
      }
    }

    // Reverse seller position
    const sellerPos = this.positions.get(trade.sellerId);
    if (sellerPos) {
      sellerPos.netPosition += trade.quantity;
      sellerPos.totalSold -= trade.quantity;
      sellerPos.trades = sellerPos.trades.filter(t => t.id !== trade.id);
      if (sellerPos.totalSold > 0) {
        const totalSellRevenue = sellerPos.trades
          .filter(t => t.side === 'sell')
          .reduce((s, t) => s + t.price * t.quantity, 0);
        sellerPos.avgSellPrice = totalSellRevenue / sellerPos.totalSold;
      } else {
        sellerPos.avgSellPrice = 0;
      }
    }

    return { undone: trade };
  }

  pushInfoUpdate(text) {
    const update = {
      id: uuidv4(),
      text,
      timestamp: Date.now(),
    };
    this.infoUpdates.push(update);
    return update;
  }

  pause() {
    if (this.phase === PHASES.ACTIVE_TRADING) {
      this.previousPhase = this.phase;
      this.phase = PHASES.PAUSED;
      return true;
    }
    return false;
  }

  resume() {
    if (this.phase === PHASES.PAUSED && this.previousPhase) {
      this.phase = this.previousPhase;
      this.previousPhase = null;
      return true;
    }
    return false;
  }

  settle() {
    this.phase = PHASES.SETTLEMENT;
    const leaderboard = [];

    const allPlayers = this.version === 'B' ? this.hostParticipants : Array.from(this.players.values()).filter(p => !p.isHost);

    for (const player of allPlayers) {
      const pos = this.positions.get(player.id);
      if (!pos) continue;

      // Calculate P&L from individual trades
      let pnl = 0;
      for (const trade of pos.trades) {
        if (trade.side === 'buy') {
          pnl += (this.trueAnswer - trade.price) * trade.quantity;
        } else {
          pnl += (trade.price - this.trueAnswer) * trade.quantity;
        }
      }

      leaderboard.push({
        playerId: player.id,
        name: player.name,
        netPosition: pos.netPosition,
        pnl: Math.round(pnl * 100) / 100,
        numTrades: pos.trades.length,
        isMarketMaker: player.id === this.spreadWinner,
      });
    }

    leaderboard.sort((a, b) => b.pnl - a.pnl);

    return {
      trueAnswer: this.trueAnswer,
      leaderboard,
      totalTrades: this.trades.length,
    };
  }

  getPlayerName(playerId) {
    const player = this.players.get(playerId);
    if (player) return player.name;
    if (this.hostParticipants) {
      const hp = this.hostParticipants.find(p => p.id === playerId);
      if (hp) return hp.name;
    }
    return 'Unknown';
  }

  getPlayerPosition(playerId) {
    const pos = this.positions.get(playerId);
    if (!pos) return null;

    // Calculate unrealized P&L using last trade price
    const lastTradePrice = this.trades.length > 0 ? this.trades[this.trades.length - 1].price : null;
    let unrealizedPnl = 0;
    if (lastTradePrice !== null) {
      for (const trade of pos.trades) {
        if (trade.side === 'buy') {
          unrealizedPnl += (lastTradePrice - trade.price) * trade.quantity;
        } else {
          unrealizedPnl += (trade.price - lastTradePrice) * trade.quantity;
        }
      }
    }

    return {
      netPosition: pos.netPosition,
      avgBuyPrice: pos.totalBought > 0 ? Math.round(pos.avgBuyPrice * 100) / 100 : null,
      avgSellPrice: pos.totalSold > 0 ? Math.round(pos.avgSellPrice * 100) / 100 : null,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      numTrades: pos.trades.length,
    };
  }

  // Full state for host
  getHostState() {
    const players = this.version === 'B'
      ? this.hostParticipants.map(p => ({ ...p, position: this.getPlayerPosition(p.id) }))
      : Array.from(this.players.values()).map(p => ({ ...p, position: this.getPlayerPosition(p.id) }));

    return {
      id: this.id,
      phase: this.phase,
      version: this.version,
      question: this.question,
      config: this.config,
      players,
      spreadBids: Array.from(this.spreadBids.entries()).map(([id, b]) => ({
        playerId: id,
        name: this.getPlayerName(id),
        width: b.width,
      })),
      spreadWinner: this.spreadWinner,
      auctionSpread: this.auctionSpread,
      initialMarket: this.initialMarket,
      initialDecisions: Array.from(this.initialDecisions.entries()).map(([id, d]) => ({
        playerId: id,
        name: this.getPlayerName(id),
        decision: d,
      })),
      trades: this.trades.map(t => ({
        ...t,
        buyerName: this.getPlayerName(t.buyerId),
        sellerName: this.getPlayerName(t.sellerId),
      })),
      orderBook: this.orderBook ? this.orderBook.getBookSnapshot(10) : null,
      infoUpdates: this.infoUpdates,
      displayedMarket: this.displayedMarket,
      trueAnswer: this.trueAnswer,
    };
  }

  // State for a participant
  getPlayerState(playerId) {
    return {
      id: this.id,
      phase: this.phase,
      version: this.version,
      question: this.question,
      config: this.config,
      myId: playerId,
      myName: this.getPlayerName(playerId),
      myPosition: this.getPlayerPosition(playerId),
      myOrders: this.orderBook ? this.orderBook.getPlayerOrders(playerId) : [],
      spreadWinner: this.spreadWinner ? {
        id: this.spreadWinner,
        name: this.getPlayerName(this.spreadWinner),
        spread: this.auctionSpread,
      } : null,
      initialMarket: this.initialMarket,
      hasSubmittedSpread: this.spreadBids.has(playerId),
      hasSubmittedDecision: this.initialDecisions.has(playerId),
      playerCount: this.version === 'B'
        ? (this.hostParticipants ? this.hostParticipants.length : 0)
        : this.players.size - 1, // exclude host
      trades: this.trades.map(t => ({
        ...t,
        buyerName: this.getPlayerName(t.buyerId),
        sellerName: this.getPlayerName(t.sellerId),
      })),
      orderBook: this.orderBook ? this.orderBook.getBookSnapshot(10) : null,
      infoUpdates: this.infoUpdates,
      isMarketMaker: playerId === this.spreadWinner,
      // Reveal true answer only during settlement
      trueAnswer: this.phase === PHASES.SETTLEMENT ? this.trueAnswer : null,
    };
  }
}

module.exports = { Game, OrderBook, PHASES };
