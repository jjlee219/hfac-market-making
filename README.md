# HFAC Market Making Game

A real-time market-making trading game for HFAC Quant sessions. Supports two modes:

- **Version A (Full Platform):** Digital order book with price-time priority matching. Players join via game code and trade on the platform.
- **Version B (Open Outcry):** Host-mediated. Participants trade verbally; the host enters all transactions. No player devices needed.

## Quick Start

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Build the frontend
cd client && npx vite build && cd ..

# Start the server
node server/index.js
```

Open **http://localhost:3001** in your browser. That's it.

## How It Works

### Hosting a Game
1. Go to the landing page and click **Host Game**
2. Enter the question, true answer, choose Version A or B, and set position limits
3. Share the **game code** with participants (or add names manually for Version B)
4. Walk through the phases: Question → Spread Auction → Market Posting → Initial Trading → Active Trading → Settlement

### Joining a Game (Version A only)
1. Enter the game code and a display name
2. Participate in the spread auction, initial trading, and active trading
3. See your P&L on the settlement screen

### Game Phases
1. **Lobby** — Players join / host adds participants
2. **Question Reveal** — The question is shown
3. **Spread Auction** — Sealed bid for tightest spread; winner becomes market-maker
4. **Market Posting** — Winner sets a mid-price; platform computes bid/ask
5. **Initial Trading** — Everyone simultaneously decides: buy at ask, sell at bid, or pass
6. **Active Trading** — Continuous trading (order book in Version A, verbal in Version B)
7. **Settlement** — True answer revealed, P&L calculated, leaderboard displayed

### Host Controls During Trading
- Push **information updates** (hints about fair value) to all screens
- **Pause/Resume** trading (Version A)
- **End game** to settle and show leaderboard
- Version B: Enter transactions, update displayed market

## Deployment

The app is a single Node.js server serving both the API (Socket.IO) and the built React frontend. Deploy anywhere that runs Node:

```bash
# Railway / Render / Fly.io
# Set the start command to:
node server/index.js

# The PORT env var is respected automatically
```

## Tech Stack
- **Backend:** Node.js + Express + Socket.IO
- **Frontend:** React 18 + Vite
- **State:** In-memory (no database needed)
- **Styling:** Custom CSS with trading terminal aesthetic
