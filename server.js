// server.js
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("✅ Tripflow Backend is running!");
});

// Notification route (for Google Sheets)
// Simple in-memory list of clients via WebSocketServer
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  wss.clients.forEach((client) => {
    try {
      if (client.readyState === 1) client.send(payload);
    } catch (e) {
      console.warn("WS send failed:", e);
    }
  });
}

wss.on("connection", (ws) => {
  console.log("🔔 WebSocket client connected");
  ws.on("close", () => console.log("🔕 WebSocket client disconnected"));
});

// Notification route (for Google Sheets or external triggers)
app.post("/notify", (req, res) => {
  const body = req.body || {};
  console.log("Received notification:", body);
  // Broadcast a normalized payload to all websocket clients
  const message = {
    title: body.title || "Notification",
    message: body.message || body.text || "",
    type: body.type || "general",
    createdAt: new Date().toISOString(),
  };
  broadcast(message);
  res.json({ success: true });
});

app.post("/saveRecord", (req, res) => {
  console.log("Received record:", req.body);
  res.json({ success: true });
});

// Health endpoint
app.get("/health", (_req, res) => res.json({ ok: true }));

// Start server (HTTP + WebSocket upgrade)
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server running (HTTP + WS) on port ${PORT}`));
