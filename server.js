import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT_API = 7070;
const PORT_WS = 7071;
const wss = new WebSocketServer({ port: PORT_WS });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

app.post("/api/notify", (req, res) => {
  const notification = req.body;
  console.log("📨 Notification received:", notification);

  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(notification));
    }
  }

  res.send({ status: "ok" });
});

app.listen(PORT_API, () =>
  console.log(`✅ Notification API running on ${PORT_API}`)
);
console.log(`✅ WebSocket Server on ${PORT_WS}`);