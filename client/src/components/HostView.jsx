import React, { useState, useCallback } from 'react';
import { emit } from '../socket.js';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function PnlCell({ value }) {
  if (value == null) return <span className="text-muted">—</span>;
  const cls = value > 0 ? 'text-green' : value < 0 ? 'text-red' : 'text-secondary';
  return <span className={cls}>{value > 0 ? '+' : ''}{formatNum(value)}</span>;
}

// ═══════════════════ LOBBY PHASE ═══════════════════
function LobbyPhase({ state }) {
  const [newName, setNewName] = useState('');

  const addParticipant = async () => {
    if (!newName.trim()) return;
    await emit('game:addParticipant', { name: newName.trim() });
    setNewName('');
  };

  const removeParticipant = async (id) => {
    await emit('game:removeParticipant', { participantId: id });
  };

  const startGame = async () => {
    await emit('game:start', {});
  };

  const isVersionB = state.version === 'B';
  const players = isVersionB
    ? (state.players || []).filter(p => !p.isHost)
    : (state.players || []).filter(p => !p.isHost);

  return (
    <div className="phase-screen">
      <div className="topbar-code" style={{ fontSize: 40, padding: '12px 32px' }}>{state.id}</div>
      <h2>Waiting for players</h2>
      <p>{isVersionB ? 'Add participants below. They won\'t need to connect — you\'ll manage everything.' : 'Share the game code above. Players join from the landing page.'}</p>

      {isVersionB && (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div className="add-participant">
            <input
              placeholder="Participant name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addParticipant()}
            />
            <button className="btn btn-ghost btn-sm" onClick={addParticipant}>Add</button>
          </div>
          <div className="participant-list">
            {players.map(p => (
              <div key={p.id} className="participant-chip">
                <span>{p.name}</span>
                <button onClick={() => removeParticipant(p.id)}>&times;</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isVersionB && (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div className="participant-list">
            {players.map(p => (
              <div key={p.id} className="participant-chip">
                <span>{p.name}</span>
              </div>
            ))}
          </div>
          {players.length === 0 && <p className="text-muted mt-8" style={{ fontSize: 13 }}>No players yet...</p>}
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ maxWidth: 300, marginTop: 16 }}
        onClick={startGame}
        disabled={isVersionB ? players.length < 2 : players.length < 2}
      >
        Start Game ({players.length} players)
      </button>
    </div>
  );
}

// ═══════════════════ QUESTION REVEAL ═══════════════════
function QuestionPhase({ state }) {
  const startAuction = async () => {
    await emit('game:startAuction', {});
  };
  return (
    <div className="phase-screen">
      <p className="text-muted" style={{ fontSize: 12 }}>THE QUESTION</p>
      <h2 style={{ fontSize: 28, maxWidth: 600 }}>{state.question}</h2>
      <p className="text-muted">Players are now seeing this question. Start the spread auction when ready.</p>
      <button className="btn btn-primary" style={{ maxWidth: 300 }} onClick={startAuction}>
        Start Spread Auction
      </button>
    </div>
  );
}

// ═══════════════════ SPREAD AUCTION ═══════════════════
function SpreadAuctionPhase({ state }) {
  const [spreadInput, setSpreadInput] = useState('');

  const closeAuction = async () => {
    const res = await emit('spread:close', {});
    if (res.error) alert(res.error);
  };

  // Version B: host submits spreads on behalf of participants
  const submitSpreadForParticipant = async (participantId) => {
    // Version B uses a different flow — host verbally collects and enters
    // We'll reuse the same UI but with manual entry
  };

  const bids = state.spreadBids || [];

  return (
    <div className="phase-screen">
      <h2>Spread Auction</h2>
      <p>{state.version === 'B' ? 'Collect spread bids verbally. When ready, close the auction.' : 'Players are submitting their spread widths...'}</p>

      <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="panel">
          <div className="panel-header">Spread Bids ({bids.length} received)</div>
          <div className="panel-body">
            {bids.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: 16, fontSize: 13 }}>Waiting for bids...</p>
            ) : (
              <table className="participants-table">
                <thead><tr><th>Player</th><th>Spread</th></tr></thead>
                <tbody>
                  {bids.sort((a, b) => a.width - b.width).map(b => (
                    <tr key={b.playerId}>
                      <td style={{ fontFamily: 'var(--font-sans)' }}>{b.name}</td>
                      <td>{formatNum(b.width)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {state.version === 'B' && (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <p className="text-muted mb-8" style={{ fontSize: 12 }}>Enter spreads for participants (Version B)</p>
          {(state.players || []).filter(p => !p.isHost).map(p => (
            <SpreadEntryRow key={p.id} participant={p} submitted={bids.some(b => b.playerId === p.id)} />
          ))}
        </div>
      )}

      <button className="btn btn-primary" style={{ maxWidth: 300 }} onClick={closeAuction} disabled={bids.length === 0}>
        Close Auction
      </button>
    </div>
  );
}

function SpreadEntryRow({ participant, submitted }) {
  const [val, setVal] = useState('');
  const submit = async () => {
    if (!val) return;
    const res = await emit('spread:submitFor', { participantId: participant.id, width: parseFloat(val) });
    if (res.error) alert(res.error);
  };

  if (submitted) return (
    <div className="participant-chip" style={{ marginBottom: 4 }}>
      <span>{participant.name}</span>
      <span className="submitted-check">&#10003;</span>
    </div>
  );

  return (
    <div className="add-participant" style={{ marginBottom: 4 }}>
      <span style={{ minWidth: 80, fontSize: 13 }}>{participant.name}</span>
      <input placeholder="Spread" value={val} onChange={e => setVal(e.target.value)} style={{ maxWidth: 100 }}
        onKeyDown={e => e.key === 'Enter' && submit()} />
      <button className="btn btn-ghost btn-xs" onClick={submit}>Set</button>
    </div>
  );
}

// ═══════════════════ MARKET POSTING ═══════════════════
function MarketPostingPhase({ state }) {
  const [midPrice, setMidPrice] = useState('');

  const postMarket = async () => {
    if (!midPrice) return;
    const res = await emit('market:post', { midPrice: parseFloat(midPrice) });
    if (res.error) alert(res.error);
  };

  const winnerName = state.players
    ? (state.players.find(p => p.id === state.spreadWinner)?.name || 'Unknown')
    : 'Unknown';

  return (
    <div className="phase-screen">
      <h2>Market Posting</h2>
      <p>
        <strong style={{ color: 'var(--accent)' }}>{winnerName}</strong> won with a spread of{' '}
        <strong className="mono">{formatNum(state.auctionSpread)}</strong>
      </p>
      {state.version === 'B' ? (
        <>
          <p className="text-muted">Ask {winnerName} for their mid-price estimate, then enter it below.</p>
          <div className="spread-submit" style={{ maxWidth: 300, width: '100%' }}>
            <input
              type="number"
              placeholder="Mid-price"
              value={midPrice}
              onChange={e => setMidPrice(e.target.value)}
              step="any"
            />
            <button className="btn btn-primary" onClick={postMarket} disabled={!midPrice}>Post</button>
          </div>
        </>
      ) : (
        <p className="text-muted">Waiting for {winnerName} to post their mid-price...</p>
      )}

      {state.initialMarket && (
        <div className="market-display mt-16">
          <div className="market-side">
            <div className="market-side-label bid-label">Bid</div>
            <div className="market-side-price bid-price">{formatNum(state.initialMarket.bid)}</div>
          </div>
          <div className="market-separator">/</div>
          <div className="market-side">
            <div className="market-side-label ask-label">Ask</div>
            <div className="market-side-price ask-price">{formatNum(state.initialMarket.ask)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ INITIAL TRADING ═══════════════════
function InitialTradingPhase({ state }) {
  const [decisions, setDecisions] = useState({});

  const setDecision = (pid, decision) => {
    setDecisions(prev => ({ ...prev, [pid]: decision }));
  };

  const resolveInitial = async () => {
    if (state.version === 'B') {
      // Submit all decisions at once
      const res = await emit('initial:submitAll', { decisions });
      if (res.error) alert(res.error);
    } else {
      const res = await emit('initial:resolve', {});
      if (res.error) alert(res.error);
    }
  };

  const participants = (state.players || []).filter(p => !p.isHost && p.id !== state.spreadWinner);
  const decisionsReceived = state.initialDecisions || [];

  return (
    <div className="phase-screen">
      <h2>Initial Market Interaction</h2>

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

      {state.version === 'B' ? (
        <div style={{ width: '100%', maxWidth: 500 }}>
          <p className="text-muted mb-12" style={{ textAlign: 'center', fontSize: 13 }}>
            Eyes closed, thumbs up (buy) or down (sell). Enter each decision:
          </p>
          {participants.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ minWidth: 100, fontSize: 13 }}>{p.name}</span>
              {['buy', 'sell', 'pass'].map(d => (
                <button
                  key={d}
                  className={`btn btn-xs ${decisions[p.id] === d ? (d === 'buy' ? 'btn-green' : d === 'sell' ? 'btn-red' : 'btn-ghost') : 'btn-ghost'}`}
                  onClick={() => setDecision(p.id, d)}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <p className="text-muted mb-8" style={{ textAlign: 'center', fontSize: 13 }}>
            {decisionsReceived.length} of {participants.length} decisions received
          </p>
          {decisionsReceived.map(d => (
            <div key={d.playerId} className="participant-chip" style={{ marginBottom: 4 }}>
              <span>{d.name}</span>
              <span className="submitted-check">&#10003;</span>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-primary" style={{ maxWidth: 300, marginTop: 16 }} onClick={resolveInitial}>
        Resolve Initial Trades
      </button>
    </div>
  );
}

// ═══════════════════ ACTIVE TRADING (HOST) ═══════════════════
function ActiveTradingHost({ state }) {
  const [infoText, setInfoText] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeQty, setTradeQty] = useState('1');
  const [manualBid, setManualBid] = useState('');
  const [manualAsk, setManualAsk] = useState('');

  const pushInfo = async () => {
    if (!infoText.trim()) return;
    await emit('info:push', { text: infoText.trim() });
    setInfoText('');
  };

  const pauseGame = () => emit('game:pause', {});
  const resumeGame = () => emit('game:resume', {});
  const endGame = () => {
    if (confirm('End the game and settle? This cannot be undone.')) {
      emit('game:end', {});
    }
  };

  const enterTrade = async () => {
    if (!buyerId || !sellerId || !tradePrice) return;
    if (buyerId === sellerId) return alert('Buyer and seller must be different');
    const res = await emit('trade:enter', {
      buyerId, sellerId,
      price: parseFloat(tradePrice),
      quantity: parseInt(tradeQty) || 1,
    });
    if (res.error) alert(res.error);
    else setTradePrice('');
  };

  const undoTrade = async () => {
    const res = await emit('trade:undo', {});
    if (res.error) alert(res.error);
  };

  const updateMarket = async () => {
    await emit('market:update', {
      bid: manualBid ? parseFloat(manualBid) : null,
      ask: manualAsk ? parseFloat(manualAsk) : null,
    });
  };

  const isVersionB = state.version === 'B';
  const isPaused = state.phase === 'PAUSED';
  const participants = (state.players || []).filter(p => !p.isHost);
  const trades = [...(state.trades || [])].reverse();

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
          <span className="text-muted">v{state.version}</span>
        </div>
      </div>

      <div className="game-body">
        <div className="host-body">
          {/* LEFT: Controls */}
          <div className="host-controls">
            {/* Info Updates */}
            <div className="panel">
              <div className="panel-header">Push Info Update</div>
              <div className="panel-body">
                <textarea
                  rows={3}
                  placeholder="The answer is between 600k and 700k..."
                  value={infoText}
                  onChange={e => setInfoText(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)', fontSize: 13, padding: 8, resize: 'vertical', outline: 'none'
                  }}
                />
                <button className="btn btn-primary btn-sm mt-8 w-full" onClick={pushInfo}>Push Update</button>
              </div>
            </div>

            {/* Game Controls */}
            <div className="panel">
              <div className="panel-header">Game Controls</div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {!isPaused && !isVersionB && (
                  <button className="btn btn-ghost btn-sm w-full" onClick={pauseGame}>Pause Trading</button>
                )}
                {isPaused && (
                  <button className="btn btn-green btn-sm w-full" onClick={resumeGame}>Resume Trading</button>
                )}
                <button className="btn btn-red btn-sm w-full" onClick={endGame}>End Game &amp; Settle</button>
              </div>
            </div>

            {/* Version B: Transaction Entry */}
            {isVersionB && (
              <div className="panel">
                <div className="panel-header">Enter Transaction</div>
                <div className="panel-body">
                  <div className="transaction-form">
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Buyer</label>
                      <select value={buyerId} onChange={e => setBuyerId(e.target.value)}>
                        <option value="">Select buyer...</option>
                        {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Seller</label>
                      <select value={sellerId} onChange={e => setSellerId(e.target.value)}>
                        <option value="">Select seller...</option>
                        {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="form-row">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Price</label>
                        <input
                          type="number" step="any" value={tradePrice}
                          onChange={e => setTradePrice(e.target.value)}
                          style={{ fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Qty</label>
                        <input
                          type="number" min="1" value={tradeQty}
                          onChange={e => setTradeQty(e.target.value)}
                          style={{ fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                    </div>
                    <button className="btn btn-green btn-sm w-full mt-8" onClick={enterTrade}>Submit Trade</button>
                    <button className="btn btn-ghost btn-xs w-full" onClick={undoTrade}>Undo Last</button>
                  </div>
                </div>
              </div>
            )}

            {/* Version B: Manual Market Display */}
            {isVersionB && (
              <div className="panel">
                <div className="panel-header">Displayed Market</div>
                <div className="panel-body">
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10, color: 'var(--green)' }}>Bid</label>
                      <input
                        type="number" step="any" value={manualBid}
                        onChange={e => setManualBid(e.target.value)}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 10, color: 'var(--red)' }}>Ask</label>
                      <input
                        type="number" step="any" value={manualAsk}
                        onChange={e => setManualAsk(e.target.value)}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-xs w-full mt-8" onClick={updateMarket}>Update</button>
                </div>
              </div>
            )}

            {/* Info History */}
            <div className="panel" style={{ flex: 1, minHeight: 0 }}>
              <div className="panel-header">Info Updates ({(state.infoUpdates || []).length})</div>
              <div className="panel-body">
                <div className="info-feed">
                  {[...(state.infoUpdates || [])].reverse().map(u => (
                    <div key={u.id} className="info-item">
                      <div className="info-time">{formatTime(u.timestamp)}</div>
                      <div className="info-text">{u.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* CENTER: Order Book or Trade Tape */}
          <div className="host-center">
            {!isVersionB && state.orderBook && (
              <div className="panel" style={{ flex: 1, minHeight: 0 }}>
                <div className="panel-header">Order Book</div>
                <div className="panel-body">
                  <OrderBookDisplay book={state.orderBook} />
                </div>
              </div>
            )}

            <div className="panel" style={{ flex: 1, minHeight: 0 }}>
              <div className="panel-header">Trade Tape ({trades.length})</div>
              <div className="panel-body">
                <div className="trade-tape">
                  {trades.map(t => (
                    <div key={t.id} className="trade-entry">
                      <span className="trade-time">{formatTime(t.timestamp)}</span>
                      <span className="trade-price">{formatNum(t.price)}</span>
                      <span className="trade-qty">x{t.quantity}</span>
                      <span className="trade-parties">{t.buyerName} ← {t.sellerName}</span>
                    </div>
                  ))}
                  {trades.length === 0 && <p className="text-muted" style={{ textAlign: 'center', fontSize: 12, padding: 20 }}>No trades yet</p>}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Participant Overview */}
          <div className="host-right">
            <div className="panel" style={{ flex: 1, minHeight: 0 }}>
              <div className="panel-header">Participants</div>
              <div className="panel-body">
                <table className="participants-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Pos</th>
                      <th>P&L</th>
                      <th>#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'var(--font-sans)' }}>
                          {p.name}
                          {p.id === state.spreadWinner && <span style={{ color: 'var(--accent)', fontSize: 10, marginLeft: 4 }}>MM</span>}
                        </td>
                        <td className={p.position?.netPosition > 0 ? 'text-green' : p.position?.netPosition < 0 ? 'text-red' : ''}>
                          {p.position?.netPosition > 0 ? '+' : ''}{p.position?.netPosition || 0}
                        </td>
                        <td><PnlCell value={p.position?.unrealizedPnl} /></td>
                        <td className="text-muted">{p.position?.numTrades || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ SETTLEMENT ═══════════════════
function SettlementPhase({ state }) {
  const result = state; // state already has leaderboard data from settle()
  // We need to reconstruct - the settlement data is embedded in the game state
  // Actually the host state has all positions, so we compute here
  const participants = (state.players || []).filter(p => !p.isHost);

  const leaderboard = participants.map(p => {
    const pos = p.position;
    // Calculate final P&L
    let pnl = 0;
    const trades = (state.trades || []).filter(t => t.buyerId === p.id || t.sellerId === p.id);
    for (const t of trades) {
      if (t.buyerId === p.id) pnl += (state.trueAnswer - t.price) * t.quantity;
      if (t.sellerId === p.id) pnl += (t.price - state.trueAnswer) * t.quantity;
    }
    return {
      id: p.id,
      name: p.name,
      pnl: Math.round(pnl * 100) / 100,
      netPosition: pos?.netPosition || 0,
      numTrades: pos?.numTrades || 0,
      isMarketMaker: p.id === state.spreadWinner,
    };
  }).sort((a, b) => b.pnl - a.pnl);

  return (
    <div className="phase-screen" style={{ overflow: 'auto' }}>
      <p className="text-muted" style={{ fontSize: 12, letterSpacing: 1 }}>THE ANSWER</p>
      <div className="true-answer">{formatNum(state.trueAnswer)}</div>
      <h2 style={{ marginTop: 24 }}>Final Leaderboard</h2>

      <div className="leaderboard">
        {leaderboard.map((p, i) => (
          <div key={p.id} className="lb-row">
            <div className={`lb-rank ${i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : ''}`}>
              #{i + 1}
            </div>
            <div className="lb-name">
              {p.name}
              {p.isMarketMaker && <span className="mm-badge">MM</span>}
            </div>
            <div className="lb-pos">
              {p.netPosition > 0 ? '+' : ''}{p.netPosition} pos
            </div>
            <div className={`lb-pnl ${p.pnl > 0 ? 'text-green' : p.pnl < 0 ? 'text-red' : ''}`}>
              {p.pnl > 0 ? '+' : ''}{formatNum(p.pnl)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════ ORDER BOOK DISPLAY ═══════════════════
function OrderBookDisplay({ book }) {
  if (!book) return null;
  const maxQty = Math.max(
    ...book.bids.map(l => l.quantity),
    ...book.asks.map(l => l.quantity),
    1
  );

  // Show asks reversed (highest at top) then bids
  const asks = [...book.asks].reverse();
  const bids = book.bids;
  const spread = bids.length > 0 && asks.length > 0
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
        <div key={`a-${i}`} className="orderbook-row" style={{ position: 'relative' }}>
          <span></span>
          <span className="ob-price ask">{formatNum(l.price)}</span>
          <span className="ob-qty" style={{ position: 'relative' }}>
            <span className="ob-bar-fill ask" style={{ width: `${(l.quantity / maxQty) * 100}%` }} />
            <span style={{ position: 'relative' }}>{l.quantity}</span>
          </span>
        </div>
      ))}
      {spread !== null && (
        <div className="spread-display">
          Spread: {formatNum(spread)}
        </div>
      )}
      {bids.map((l, i) => (
        <div key={`b-${i}`} className="orderbook-row" style={{ position: 'relative' }}>
          <span className="ob-qty" style={{ position: 'relative', textAlign: 'left' }}>
            <span className="ob-bar-fill bid" style={{ width: `${(l.quantity / maxQty) * 100}%` }} />
            <span style={{ position: 'relative' }}>{l.quantity}</span>
          </span>
          <span className="ob-price bid">{formatNum(l.price)}</span>
          <span></span>
        </div>
      ))}
      {bids.length === 0 && asks.length === 0 && (
        <p className="text-muted" style={{ textAlign: 'center', fontSize: 12, padding: 20 }}>Empty order book</p>
      )}
    </div>
  );
}

// ═══════════════════ MAIN HOST VIEW ═══════════════════
export default function HostView({ state }) {
  switch (state.phase) {
    case 'LOBBY':
      return <LobbyPhase state={state} />;
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
      return <ActiveTradingHost state={state} />;
    case 'SETTLEMENT':
      return <SettlementPhase state={state} />;
    default:
      return <div className="phase-screen"><p>Unknown phase: {state.phase}</p></div>;
  }
}
