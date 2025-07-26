const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require("body-parser");
const {
  getUserIdByCompany,
  UpdateInboxPaid,
  UpdateOrderPaid,
} = require("./model");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  },
});

app.use(bodyParser.json());

const connectedUsers = {};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.user_id;

  if (userId) {
    connectedUsers[userId] = socket.id;
    console.log(`User ${userId} connected with socket ID: ${socket.id}`);
  } else {
    console.log("Client connected without user_id");
  }

  socket.on("disconnect", () => {
    for (const [uid, sid] of Object.entries(connectedUsers)) {
      if (sid === socket.id) {
        delete connectedUsers[uid];
        console.log(`User ${uid} disconnected`);
        break;
      }
    }
  });
});

app.post("/midtrans-callback", async (req, res) => {
  const data = req.body;

  if (data.status == "PAID") {
    // Get User ID
    var orders = await getUserIdByCompany(data.order_id);

    const userId = orders.length == 0 ? "" : orders[0].user_id;
    const projectId = orders.length == 0 ? "" : orders[0].project_id;

    if (userId && connectedUsers[userId]) {
      const socketId = connectedUsers[userId];
      io.to(socketId).emit("payment-update", data);
      console.log(`Sent update to user ${userId}`);
    } else {
      console.log("User not connected or user_id missing");
    }

    // Update Order "PAID"
    await UpdateOrderPaid(data.order_id);

    // Update Inbox "PAID"
    await UpdateInboxPaid(projectId);
  }

  res.status(200).send("OK");
});

server.listen(3333, () => {
  console.log("Server running on http://localhost:3333");
});
