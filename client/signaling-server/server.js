const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Signaling Server Active");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-call", (userId) => {
    try {
      socket.join(userId);
      console.debug(`Socket ${socket.id} joined room ${userId}`);
    } catch (e) { console.warn("join-call error", e); }
  });

  socket.on("signal", (data) => {
    try {
      if (!data || !data.to) {
        console.warn("signal missing 'to' field", data);
        return;
      }
      io.to(data.to).emit("signal", data);
    } catch (e) {
      console.error("signal forward error", e);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});
