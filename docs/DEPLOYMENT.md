## TTT CRM Deployment & Notifications

This guide helps you deploy the backend (Express + WebSocket) and verify end-to-end notifications from Google Apps Script to the app.

---

### 1) Backend (Render)

- Option A: Render Blueprint (recommended)
  - Connect this repo in Render and choose "Use render.yaml".
  - The file `render.yaml` provisions a Node web service with health check and env vars.
  - Set `NOTIFY_SECRET` in the Render dashboard after the first deploy.

- Option B: Manual Web Service
  - Service: Web Service
  - Environment: Node.js
  - Start command: `npm start`
  - Port: Render sets `PORT`; the server reads `process.env.PORT || 8080`.
  - Build command: `npm install && npm run build-sw` (optional; backend does not need a build step).

Endpoints:
- `GET /` → plain text: "TTT CRM Backend is running!"
- `GET /health` → `{ ok: true }`
- `POST /api/notify` → accepts JSON and broadcasts via WebSocket

WebSockets:
- Same domain as the HTTP service, default path, no auth.
- The app will connect to `wss://<your-backend-host>` automatically in production.

Security: shared secret for `/api/notify` is supported. Set `NOTIFY_SECRET` on the backend and the same value in Apps Script `CONFIG.BACKEND_SECRET`.

---

### 2) Frontend

- Build: `npm run build`
- Deploy to any static hosting (Render Static, Netlify, Vercel, etc.).
- In production, the app uses `https://TTT CRM-backend-6xzr.onrender.com` by default. If you deploy a different backend URL, update `src/config/api.ts` accordingly and rebuild.

Local dev:
- `npm run start` (backend) → binds `http://localhost:8080`
- `npm run dev` (frontend) → `http://localhost:3000`
- WebSocket will connect to `ws://localhost:8080` in dev.

---

### 3) Google Apps Script

File: `Code.gs`
- Set `CONFIG.BACKEND_URL` to your backend URL: `https://<your-backend-host>/api/notify`
- (Recommended) Set `CONFIG.BACKEND_SECRET` to the same value as backend `NOTIFY_SECRET`
- Deploy triggers per README (on-edit + daily reminder)

Smoke test Apps Script → Backend:
```
// In Apps Script console, run:
sendToBackend({
  title: 'Test',
  message: 'Hello from Apps Script',
  type: 'system_alert',
  role: 'all',
  priority: 'medium',
  actions: [],
  timestamp: new Date(),
});
```

You should receive 200 OK from the backend.

Smoke test with curl (production):
```
curl -X POST "https://<your-backend-host>/api/notify" \
  -H "Content-Type: application/json" \
  -H "x-TTT CRM-secret: <your-secret>" \
  -d '{
    "type": "system_alert",
    "title": "Smoke Test",
    "message": "Hello from curl"
  }'
```

---

### 4) End-to-end Notification Flow

1. Open the app (web or Android build) so it can establish a WebSocket connection.
2. Send a notification:
   - Via Apps Script (above), or
   - `curl`/Postman to `POST https://<your-backend-host>/api/notify` with JSON body and header `x-TTT CRM-secret: <secret>`:
```
{
  "type": "new_trip",
  "title": "New Trip",
  "message": "Trip for Alice created",
  "priority": "high"
}
```
3. The app should show a toast and increment the unread badge.

Offline storage:
- Notifications are stored in IndexedDB (`notifications-db` → `notifications` store) and marked read when you call `markAllAsRead()` via UI.

---

### 5) Troubleshooting

- No notifications arriving:
  - Confirm WebSocket connection in browser devtools (Network → WS).
  - Validate backend `/health` responds 200.
  - Verify `src/config/api.ts` points to the right backend for your environment.

- Apps Script returns non-200:
  - Check Render logs.
  - Ensure `CONFIG.BACKEND_URL` is correct and reachable from Google servers.

- Mixed content / WS blocked:
  - Use `https` on the backend so the app connects via `wss://` in production.

---

### 6) Optional: Protecting `/api/notify`

If you want to lock down the endpoint:
- Add a header check in `server.js` (e.g., `x-TTT CRM-secret`) against `process.env.NOTIFY_SECRET`.
- Add the same header in `Code.gs` within `UrlFetchApp.fetch` options.
- Set `NOTIFY_SECRET` in Render environment variables.

This is not enabled by default to keep onboarding simple.
