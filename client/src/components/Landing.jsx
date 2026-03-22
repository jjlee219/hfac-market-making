import React, { useState } from 'react';

export default function Landing({ onHost, onJoin, error, connected }) {
  const [tab, setTab] = useState('join');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');

  // Host form
  const [question, setQuestion] = useState('');
  const [trueAnswer, setTrueAnswer] = useState('');
  const [version, setVersion] = useState('A');
  const [positionLimit, setPositionLimit] = useState('7');
  const [tickSize, setTickSize] = useState('1');

  const handleHost = (e) => {
    e.preventDefault();
    if (!question.trim() || !trueAnswer) return;
    onHost({
      question: question.trim(),
      trueAnswer: parseFloat(trueAnswer),
      version,
      config: {
        positionLimit: parseInt(positionLimit) || 7,
        tickSize: parseFloat(tickSize) || 1,
      },
    });
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!joinCode.trim() || !joinName.trim()) return;
    onJoin(joinCode.trim().toUpperCase(), joinName.trim());
  };

  return (
    <div className="landing">
      <div className="landing-card">
        <div className="landing-brand">
          <h1>HFAC Quant</h1>
          <h2>Market Making Game</h2>
        </div>

        {!connected && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div className="waiting-dots"><span /><span /><span /></div>
            <p className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>Connecting to server...</p>
          </div>
        )}

        <div className="landing-tabs">
          <button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>
            Join Game
          </button>
          <button className={tab === 'host' ? 'active' : ''} onClick={() => setTab('host')}>
            Host Game
          </button>
        </div>

        {tab === 'join' && (
          <form onSubmit={handleJoin}>
            <div className="form-group">
              <label>Game Code</label>
              <input
                type="text"
                placeholder="e.g. A7K3P"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 20, textAlign: 'center', letterSpacing: 6 }}
              />
            </div>
            <div className="form-group">
              <label>Display Name</label>
              <input
                type="text"
                placeholder="Your name"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                maxLength={20}
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={!connected || !joinCode || !joinName}>
              Join Game
            </button>
          </form>
        )}

        {tab === 'host' && (
          <form onSubmit={handleHost}>
            <div className="form-group">
              <label>Question</label>
              <input
                type="text"
                placeholder="What is the population of Boston?"
                value={question}
                onChange={e => setQuestion(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>True Answer (hidden)</label>
              <input
                type="number"
                placeholder="650000"
                value={trueAnswer}
                onChange={e => setTrueAnswer(e.target.value)}
                step="any"
              />
            </div>
            <div className="form-group">
              <label>Game Version</label>
              <select value={version} onChange={e => setVersion(e.target.value)}>
                <option value="A">Version A — Full Platform (Digital Trading)</option>
                <option value="B">Version B — Open Outcry (Host-Mediated)</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Position Limit</label>
                <input
                  type="number"
                  value={positionLimit}
                  onChange={e => setPositionLimit(e.target.value)}
                  min={1}
                />
              </div>
              <div className="form-group">
                <label>Tick Size</label>
                <input
                  type="number"
                  value={tickSize}
                  onChange={e => setTickSize(e.target.value)}
                  step="any"
                  min={0.01}
                />
              </div>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={!connected || !question || !trueAnswer}>
              Create Game
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
