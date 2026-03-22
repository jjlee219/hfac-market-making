import React, { useState, useEffect, useCallback } from 'react';
import { socket, emit } from './socket.js';
import Landing from './components/Landing.jsx';
import HostView from './components/HostView.jsx';
import PlayerView from './components/PlayerView.jsx';

export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'host' | 'player'
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('game:state', (state) => {
      setGameState(state);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('game:state');
    };
  }, []);

  const handleCreate = useCallback(async (data) => {
    setError(null);
    const res = await emit('game:create', data);
    if (res.error) {
      setError(res.error);
    } else {
      setGameState(res.state);
      setView('host');
    }
  }, []);

  const handleJoin = useCallback(async (code, name) => {
    setError(null);
    const res = await emit('game:join', { code, name });
    if (res.error) {
      setError(res.error);
    } else {
      setGameState(res.state);
      setView('player');
    }
  }, []);

  if (view === 'landing') {
    return <Landing onHost={handleCreate} onJoin={handleJoin} error={error} connected={connected} />;
  }

  if (view === 'host' && gameState) {
    return <HostView state={gameState} />;
  }

  if (view === 'player' && gameState) {
    return <PlayerView state={gameState} />;
  }

  return (
    <div className="phase-screen">
      <div className="waiting-dots"><span /><span /><span /></div>
      <p>Connecting...</p>
    </div>
  );
}
