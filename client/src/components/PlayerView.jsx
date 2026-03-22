import React, { useState } from 'react';
import { emit } from '../socket.js';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ═══════════════════ WAITING / LOBBY ═══════════════════
function WaitingPhase({ state }) {
  return (
    <div className="phase-screen">
      <div className="topbar-code" style={{ fontSize: 32, padding: '10px 24px' }}>{state.id}</div>
      <h2>You're in!</h2>
      <p>Welcome, <strong style={{ color: 'var(--accent)' }}>{state.myName}</strong>. Waiting for the host to start the game.</p>
      <div className="waiting-dots"><span /><span /><span /></div>
      <p className="text-muted" style={{ fontSize: 12 }}>{state.playerCount} player{state.playerCount !== 1 ? 's' : ''} connected</p>
    </div>
  );
}

// ═══════════════════ QUESTION REVEAL ═══════════════════
function QuestionPhase({ state }) {
  return (
    <div className="phase-screen">
      <p className="text-muted" style={{ fontSize: 12, letterSpacing: 1 }}>THE QUESTION</p>
      <h2 style={{ fontSize: 28, maxWidth: 600 }}>{state.question}</h2>
      <div className="waiting-dots" style={{ marginTop: 16 }}><span /><span /><span /></div>
      <p className="text-muted">The spread auction is about to begin...</p>
    </div>
  );
}

// ═══════════════════ SPREAD AUCTION ═══════════════════
function SpreadAuctionPhase({ state }) {
  const [spreadWidth, setSpreadWidth] = useState('');
  const [submitted, setSubmitted] = useState(state.hasSubmittedSpread);

  const submitSpread = async () => {
    if (!spreadWidth) return;
    const res = await emit('spread:submit', { width: parseFloat(spreadWidth) });
    if (res.error) alert(res.error);
    else setSubmitted(true);
  };

  return (
    <div className="phase-screen">
      <h2>Spread Auction</h2>
      <p style={{ maxWidth: 500 }}>
        Bid for the right to make the market. Submit the tightest spread you're willing to quote.
        The narrowest spread wins.
      </p>
      <p className="text-muted" style={{ fontSize: 13 }}>Question: <strong style={{ color: 'var(--text-primary)' }}>{state.question}</strong></p>

      {submitted ? (
        <div style={{ textAlign: 'center' }}>
          <div className="submitted-check" style={{ fontSize: 48 }}>&#10003;</div>
          <p className="text-muted mt-8">Spread submitted! Waiting for the host to close the auction.</p>
        </div>
      ) : (
        <div className="spread-submit" style={{ maxWidth: 320, width: '100%' }}>
          <input
            type="number"
            placeholder="Spread width"
            value={spreadWidth}
            onChange={e => setSpreadWidth(e.target.value)}
            step="any"
            min="0"
            autoFocus
          />
          <button className="btn btn-primary" onClick={submitSpread} disabled={!spreadWidth || parseFloat(spreadWidth) <= 0}>
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ MARKET POSTING ═══════════════════
function MarketPostingPhase({ state }) {
  const [midPrice, setMidPrice] = useState('');
  const isWinner = state.isMarketMaker;

  const postMarket = async () => {
    if (!midPrice) return;
    const res = await emit('market:post', { midPrice: parseFloat(midPrice) });
    if (res.error) alert(res.error);
  };

  return (
    <div className="phase-screen">
      <h2>Spread Auction Result</h2>
      {state.spreadWinner && (
        <p>
          <strong style={{ color: 'var(--accent)' }}>{state.spreadWinner.name}</strong> won with a spread of{' '}
          <strong className="mono">{formatNum(state.spreadWinner.spread)}</strong>
        </p>
      )}

      {isWinner ? (
        <>
          <p style={{ color: 'var(--yellow)', fontWeight: 600 }}>You won the auction! Post your mid-price to set the market.</p>
          <div className="spread-submit" style={{ maxWidth: 320, width: '100%' }}>
            <input
              type="number"
              placeholder="Your mid-price estimate"
              value={midPrice}
              onChange={e => setMidPrice(e.target.value)}
              step="any"
              autoFocus
            />
            <button className="btn btn-primary" onClick={postMarket} disabled={!midPrice}>
              Post Market
            </button>
          </div>
          {midPrice && (
            <div className="market-display mt-16">
              <div className="market-side">
                <div className="market-side-label bid-label">Bid</div>
                <div className="market-side-price bid-price">
                  {formatNum(parseFloat(midPrice) - state.spreadWinner.spread / 2)}
                </div>
              </div>
              <div className="market-separator">/</div>
              <div className="market-side">
                <div className="market-side-label ask-label">Ask</div>
                <div className="market-side-price ask-price">
                  {formatNum(parseFloat(midPrice) + state.spreadWinner.spread / 2)}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="waiting-dots"><span /><span /><span /></div>
          <p className="text-muted">Waiting for the market-maker to post their price...</p>
        </>
      )}
    </div>
  );
}

// ═══════════════════ INITIAL TRADING ═══════════════════
function InitialTradingPhase({ state }) {
  const [decided, setDecided] = useState(state.hasSubmittedDecision);

  const submitDecision = async (decision) => {
    const res = await emit('initial:decide', { decision });
    if (res.error) alert(res.error);
    else setDecided(true);
  };

  if (state.isMarketMaker) {
    return (
      <div className="phase-screen">
        <h2>Initial Market</h2>
        <div className="market-display">
          <div className="market-side">
            <div className="market-side-label bid-label">Your Bid</div>
            <div className="market-side-price bid-price">{formatNum(state.initialMarket?.bid)}</div>
          </div>
          <div className="market-separator">/</div>
          <div className="market-side">
            <div className="market-side-label ask-label">Your Ask</div>
            <div className="market-side-price ask-price">{formatNum(state.initialMarket?.ask)}</div>
          </div>
        </div>
        <p className="text-muted mt-16">Other players are deciding whether to buy or sell. You are obligated to fill all orders.</p>
        <div className="waiting-dots"><span /><span /><span /></div>
      </div>
    );
  }

  return (
    <div className="phase-screen">
      <h2>The Market</h2>
      <div className="market-display">
        <div className="market-side">
          <div className="market-side-label bid-label">Bid</div>
          <div className="market-side-price bid-price">{formatNum(state.initialMarket?.bid)}</div>
        </div>
        <div className="market-separator">/</div>
        <div className="market-side">
          <div className="market-side-label ask-label">Ask</div>
          <div className="market-side-price ask-price">{formatNum(state.initialMarket?.ask)}</div>
        </div>
      </div>

      {decided ? (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <div className="submitted-check" style={{ fontSize: 48 }}>&#10003;</div>
          <p className="text-muted mt-8">Decision submitted! Waiting for all players...</p>
        </div>
      ) : (
        <div className="decision-buttons" style={{ maxWidth: 400, width: '100%' }}>
          <button className="btn btn-green" onClick={() => submitDecision('buy')}>
            Buy @ {formatNum(state.initialMarket?.ask)}
          </button>
          <button className="btn btn-red" onClick={() => submitDecision('sell')}>
            Sell @ {formatNum(state.initialMarket?.bid)}
          </button>
          <button className="btn btn-ghost" onClick={() => submitDecision('pass')}>
            Pass
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ ACTIVE TRADING ═══════════════════
function ActiveTradingPlayer({ state }) {
  const [orderPrice, setOrderPrice] = useState('');
  const [orderQty, setOrderQty] = useState('1');

  const submitOrder = async (side) => {
    if (!orderPrice) return;
    const res = await emit('order:submit', {
      side,
      price: parseFloat(orderPrice),
      quantity: parseInt(orderQty) || 1,
    });
    if (res.error) alert(res.error);
    else setOrderPrice('');
  };

  const cancelOrder = async (orderId) => {
    await emit('order:cancel', { orderId });
  };

  const cancelAll = async () => {
    await emit('order:cancelAll', {});
  };

  const isPaused = state.phase === 'PAUSED';
  const pos = state.myPosition;
  const trades = [...(state.trades || [])].reverse().slice(0, 50);
  const myOrders = state.myOrders || [];
  const book = state.orderBook;

  return (
    <div className="game-layout">
      <div className="game-topbar">
        <div className="topbar-brand">HFAC MKT</div>
        <div className="topbar-question">{state.question}</div>
        <div className="topbar-meta">
          <span className="topbar-code">{state.id}</span>
          <span className={`topbar-phase ${isPaused ? 'paused' : ''}`}>
            {isPaused ? 'PAUSED' : 'LIVE'}
          </span>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{state.myName}</span>
        </div>
      </div>

      <div className="game-body">
        <div className="player-body">
          {/* LEFT: Order Book */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
            <div className="panel" style={{ flex: 1, minHeight: 0 }}>
              <div className="panel-header">Order Book</div>
              <div className="panel-body">
                <OrderBookDisplay book={book} />
              </div>
            </div>
          </div>

          {/* CENTER: Order Entry + Trade Tape */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
            {/* Position Summary */}
            <div className="position-box">
              <div className="pos-item">
                <div className="pos-label">Position</div>
                <div className={`pos-value ${pos?.netPosition > 0 ? 'long' : pos?.netPosition < 0 ? 'short' : 'flat'}`}>
                  {pos?.netPosition > 0 ? '+' : ''}{pos?.netPosition || 0}
                </div>
              </div>
              <div className="pos-item">
                <div className="pos-label">Unrealized P&L</div>
                <div className={`pos-value ${pos?.unrealizedPnl > 0 ? 'positive' : pos?.unrealizedPnl < 0 ? 'negative' : 'flat'}`}>
                  {pos?.unrealizedPnl > 0 ? '+' : ''}{formatNum(pos?.unrealizedPnl || 0)}
                </div>
              </div>
            </div>

            {/* Order Entry */}
            {!isPaused && (
              <div className="panel">
                <div className="panel-header">Submit Order</div>
                <div className="panel-body">
                  <div className="order-entry">
                    <div className="order-row">
                      <div className="order-input">
                        <label>Price</label>
                        <input
                          type="number"
                          step="any"
                          value={orderPrice}
                          onChange={e => setOrderPrice(e.target.value)}
                          placeholder="0"
                          autoFocus
                        />
                      </div>
                      <div className="order-input">
                        <label>Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={orderQty}
                          onChange={e => setOrderQty(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="order-buttons">
                      <button className="btn btn-green btn-sm" onClick={() => submitOrder('buy')} disabled={!orderPrice}>
                        BID (Buy)
                      </button>
                      <button className="btn btn-red btn-sm" onClick={() => submitOrder('sell')} disabled={!orderPrice}>
                        ASK (Sell)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isPaused && (
              <div className="panel">
                <div className="panel-header" style={{ background: 'var(--yellow-bg)', color: 'var(--yellow)' }}>
                  Trading Paused
                </div>
                <div className="panel-body" style={{ textAlign: 'center', padding: 20 }}>
                  <p className="text-muted">The host has paused trading. Orders cannot be placed.</p>
                </div>
              </div>
            )}

            {/* My Open Orders */}
            {myOrders.length > 0 && (
              <div className="panel">
                <div className="panel-header">
                  My Orders ({myOrders.length})
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ float: 'right', marginTop: -2 }}
                    onClick={cancelAll}
                  >
                    Cancel All
                  </button>
                </div>
                <div className="panel-body">
                  {myOrders.map(o => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                      <span className={`badge ${o.side === 'buy' ? 'badge-green' : 'badge-red'}`}>
                        {o.side === 'buy' ? 'BID' : 'ASK'}
                      </span>
                      <span className="mono">{formatNum(o.price)}</span>
                      <span className="text-muted">x{o.remainingQty}</span>
                      <button
                        className="btn btn-ghost btn-xs"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => cancelOrder(o.id)}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trade Tape */}
            <div className="panel" style={{ flex: 1, minHeight: 0 }}>
              <div className="panel-header">Trade Tape</div>
              <div className="panel-body">
                <div className="trade-tape">
                  {trades.map(t => {
                    const isMyTrade = t.buyerId === state.myId || t.sellerId === state.myId;
                    return (
                      <div key={t.id} className="trade-entry" style={isMyTrade ? { background: 'rgba(56, 189, 248, 0.05)' } : {}}>
                        <span className="trade-time">{formatTime(t.timestamp)}</span>
                        <span className="trade-price">{formatNum(t.price)}</span>
                        <span className="trade-qty">x{t.quantity}</span>
                        <span className="trade-parties">
                          {t.buyerName} ← {t.sellerName}
                        </span>
                      </div>
                    );
                  })}
                  {trades.length === 0 && <p className="text-muted" style={{ textAlign: 'center', fontSize: 12, padding: 20 }}>No trades yet</p>}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Info Updates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>
            <div className="panel" style={{ flex: 1, minHeight: 0 }}>
              <div className="panel-header">Information Updates</div>
              <div className="panel-body">
                <div className="info-feed">
                  {[...(state.infoUpdates || [])].reverse().map(u => (
                    <div key={u.id} className="info-item">
                      <div className="info-time">{formatTime(u.timestamp)}</div>
                      <div className="info-text">{u.text}</div>
                    </div>
                  ))}
                  {(state.infoUpdates || []).length === 0 && (
                    <p className="text-muted" style={{ textAlign: 'center', fontSize: 12, padding: 20 }}>No updates yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ SETTLEMENT (PLAYER) ═══════════════════
function SettlementPlayer({ state }) {
  // Calculate own P&L using the revealed true answer
  let myPnl = 0;
  if (state.trueAnswer != null) {
    for (const t of (state.trades || [])) {
      if (t.buyerId === state.myId) myPnl += (state.trueAnswer - t.price) * t.quantity;
      if (t.sellerId === state.myId) myPnl += (t.price - state.trueAnswer) * t.quantity;
    }
  }
  myPnl = Math.round(myPnl * 100) / 100;

  return (
    <div className="phase-screen">
      <p className="text-muted" style={{ fontSize: 12, letterSpacing: 1 }}>THE ANSWER</p>
      {state.trueAnswer != null && (
        <div className="true-answer">{formatNum(state.trueAnswer)}</div>
      )}
      <h2 style={{ marginTop: 24 }}>Game Over</h2>

      <div className="position-box" style={{ maxWidth: 400, width: '100%', marginTop: 16 }}>
        <div className="pos-item">
          <div className="pos-label">Your Final P&L</div>
          <div className={`pos-value ${myPnl > 0 ? 'positive' : myPnl < 0 ? 'negative' : 'flat'}`}>
            {myPnl > 0 ? '+' : ''}{formatNum(myPnl)}
          </div>
        </div>
        <div className="pos-item">
          <div className="pos-label">Final Position</div>
          <div className="pos-value flat">{state.myPosition?.netPosition || 0}</div>
        </div>
        <div className="pos-item">
          <div className="pos-label">Total Trades</div>
          <div className="pos-value flat">{state.myPosition?.numTrades || 0}</div>
        </div>
        <div className="pos-item">
          <div className="pos-label">Role</div>
          <div className="pos-value flat" style={{ fontSize: 14 }}>{state.isMarketMaker ? 'Market Maker' : 'Trader'}</div>
        </div>
      </div>

      <p className="text-muted" style={{ marginTop: 16, fontSize: 13 }}>Check the host screen for the full leaderboard.</p>
    </div>
  );
}

// ═══════════════════ ORDER BOOK DISPLAY ═══════════════════
function OrderBookDisplay({ book }) {
  if (!book) return <p className="text-muted" style={{ textAlign: 'center', fontSize: 12, padding: 20 }}>No order book</p>;

  const maxQty = Math.max(
    ...book.bids.map(l => l.quantity),
    ...book.asks.map(l => l.quantity),
    1
  );

  const asks = [...book.asks].reverse();
  const bids = book.bids;
  const spread = bids.length > 0 && book.asks.length > 0
    ? (book.asks[0].price - bids[0].price)
    : null;

  return (
    <div className="orderbook">
      <div className="orderbook-row orderbook-header">
        <span>Qty</span>
        <span style={{ textAlign: 'center' }}>Price</span>
        <span style={{ textAlign: 'right' }}>Qty</span>
      </div>
      {asks.map((l, i) => (
        <div key={`a-${i}`} className="orderbook-row">
          <span></span>
          <span className="ob-price ask">{formatNum(l.price)}</span>
          <span className="ob-qty" style={{ position: 'relative' }}>
            <span className="ob-bar-fill ask" style={{ width: `${(l.quantity / maxQty) * 100}%` }} />
            <span style={{ position: 'relative' }}>{l.quantity}</span>
          </span>
        </div>
      ))}
      {spread !== null && (
        <div className="spread-display">Spread: {formatNum(spread)}</div>
      )}
      {bids.map((l, i) => (
        <div key={`b-${i}`} className="orderbook-row">
          <span className="ob-qty" style={{ position: 'relative', textAlign: 'left' }}>
            <span className="ob-bar-fill bid" style={{ width: `${(l.quantity / maxQty) * 100}%` }} />
            <span style={{ position: 'relative' }}>{l.quantity}</span>
          </span>
          <span className="ob-price bid">{formatNum(l.price)}</span>
          <span></span>
        </div>
      ))}
      {bids.length === 0 && asks.length === 0 && (
        <p className="text-muted" style={{ textAlign: 'center', fontSize: 12, padding: 20 }}>Empty</p>
      )}
    </div>
  );
}

// ═══════════════════ MAIN PLAYER VIEW ═══════════════════
export default function PlayerView({ state }) {
  switch (state.phase) {
    case 'LOBBY':
      return <WaitingPhase state={state} />;
    case 'QUESTION':
      return <QuestionPhase state={state} />;
    case 'SPREAD_AUCTION':
      return <SpreadAuctionPhase state={state} />;
    case 'MARKET_POSTING':
      return <MarketPostingPhase state={state} />;
    case 'INITIAL_TRADING':
      return <InitialTradingPhase state={state} />;
    case 'ACTIVE_TRADING':
    case 'PAUSED':
      return <ActiveTradingPlayer state={state} />;
    case 'SETTLEMENT':
      return <SettlementPlayer state={state} />;
    default:
      return <div className="phase-screen"><p>Unknown phase: {state.phase}</p></div>;
  }
}
