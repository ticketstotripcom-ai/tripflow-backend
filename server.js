// server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("✅ Tripflow Backend is running!");
});

// Notification route (for Google Sheets)
app.post("/api/notify", (req, res) => {
  console.log("Received notification:", req.body);
  res.json({ success: true });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
