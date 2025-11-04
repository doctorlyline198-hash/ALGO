# TopstepX Dashboard Clone

This workspace now contains:

- `client/`: a Vite + React replica of the TopstepX trading dashboard with live candles, order entry, analytics, strategy panels, and risk controls.
- `server/`: a Node.js SignalR bridge that authenticates against TopstepX, consolidates trade ticks into 1-minute candles, and streams them to the frontend over WebSockets.

## Quick start

1. Create `server/.env` with your credentials (never commit this file):

	```env
	TSX_API_ENDPOINT=https://api.topstepx.com
	TSX_MARKET_HUB=https://rtc.topstepx.com/hubs/market
	TSX_USERNAME=<your_username>
	TSX_PASSWORD=<optional_password>
	TSX_API_KEY=<your_api_key>
	DEFAULT_CONTRACT=MGCZ5
	PORT=3001
	```

2. Create `client/.env` pointing to the local bridge:

	```env
	VITE_API_URL=http://localhost:3001
	VITE_WS_URL=ws://localhost:3001/ws
	VITE_DEFAULT_CONTRACT=MGCZ5
	```

3. Install dependencies:

	```powershell
	cd server; npm install
	cd ../client; npm install
	```

4. Run the bridge and the UI in separate terminals:

	```powershell
	# Terminal 1
	cd server; npm run dev

	# Terminal 2
	cd client; npm run dev
	```

5. Open `http://localhost:5173` to view the dashboard. Switching the contract in the search bar automatically re-subscribes the backend bridge and updates the chart stream.

## Notes

- The bridge emits 1-minute aggregated candles and serves current account information through `GET /api/accounts`.
- Additional REST proxies are available: `POST /api/accounts/search`, `GET|POST /api/contracts` for contract discovery, and `POST /api/orders` for submitting orders via Topstep.
- Secrets stay in `.env`; rotate them if you ever commit inadvertently.
- UI components accept live data, but still include mock strategy rows and analytics as placeholders until real strategy endpoints are wired up.
