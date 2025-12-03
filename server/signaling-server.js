// signaling-server.js
// Minimal Socket.IO signaling server with UID -> socketId mapping.
// Usage: node signaling-server.js

const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const io = new Server(server, {
  cors: { origin: "*" }, // allow all origins for dev; lock this down in production
});

// Map uid -> socket.id
const uidToSocket = new Map();
// Reverse: socket.id -> uid
const socketToUid = new Map();

io.on("connection", (socket) => {
  console.log("CLIENT CONNECTED:", socket.id);

  socket.on("register", ({ uid }) => {
    if (!uid) {
      console.warn("register missing uid from", socket.id);
      return;
    }
    uidToSocket.set(uid, socket.id);
    socketToUid.set(socket.id, uid);
    console.log(`REGISTERED UID: ${uid} -> SOCKET: ${socket.id}`);
  });

  socket.on("signal", (envelope) => {
    try {
      const { to } = envelope || {};
      if (!to) {
        console.warn("SIGNAL MISSING 'to' — BROADCASTING");
        socket.broadcast.emit("signal", envelope);
        return;
      }
      const targetSocketId = uidToSocket.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit("signal", envelope);
        console.log(`FORWARDED SIGNAL: ${envelope.type} FROM ${envelope.from} → ${to}`);
      } else {
        console.warn(`TARGET UID ${to} NOT CONNECTED — BROADCASTING FALLBACK`);
        socket.broadcast.emit("signal", envelope);
      }
    } catch (err) {
      console.error("SIGNAL FORWARD ERROR:", err);
    }
  });

  socket.on("disconnect", () => {
    const uid = socketToUid.get(socket.id);
    if (uid) {
      uidToSocket.delete(uid);
      socketToUid.delete(socket.id);
      console.log(`DISCONNECT: SOCKET ${socket.id} (uid=${uid}) — removed from map`);
    } else {
      console.log(`DISCONNECT: SOCKET ${socket.id}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`);
});
