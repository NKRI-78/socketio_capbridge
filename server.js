const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require("body-parser");

const axios = require("axios");

const {
  getUserIdByCompany,
  UpdateInboxPaid,
  UpdateOrderPaid,
  getLastInvoice,
  listPaymentMethod,
  getProject,
  storeOrder,
  storeOrderInbox,
  UpdateProjectPaid,
  StoreInbox,
} = require("./model");
const { response } = require("./response");
const { jwtF, decodeToken } = require("./jwt");
const { formatCurrency } = require("./config");

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

  socket.on("payment-update", (data) => {
    console.log("payment-update", data);
  });

  socket.on("inbox-update", (data) => {
    console.log("inbox-update", data);
  });

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

  console.log("Callback Success Socket");

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

    // Update Order "PAID"
    await UpdateProjectPaid(projectId);

    // Update Inbox "PAID"
    await UpdateInboxPaid(projectId);
  }

  res.status(200).send("OK");
});

app.post("/inbox-store", jwtF, async (req, res) => {
  const {
    title,
    content,
    field1,
    field2,
    field3,
    field4,
    field5,
    receiver_id,
  } = req.body;

  const userId = req.decoded.id;

  try {
    if (typeof title == "undefined" || title == "") {
      throw new Error("Field type title is required");
    }

    if (typeof content == "undefined" || content == "") {
      throw new Error("Field content is required");
    }

    if (typeof receiver_id == "undefined" || receiver_id == "") {
      throw new Error("Field receiver_id is required");
    }

    var field1Parse = field1;

    if (field1 != "") {
      field1Parse = parseInt(field1) / 2;
    }

    var data = {
      title: title,
      content: content,
      user_id: userId,
      receiver_id: receiver_id,
      field1: field1Parse,
      field2: field2,
      field3: field3,
      field4: field4,
      field5: field5,
    };

    await StoreInbox(data);

    if (receiver_id && connectedUsers[receiver_id]) {
      const socketId = connectedUsers[receiver_id];
      io.to(socketId).emit("inbox-update", data);
      console.log(`Sent update to user ${receiver_id}`);
    } else {
      console.log("User not connected or user_id missing");
    }

    response(res, 200, false, "", {
      title: title,
      content: content,
      field1: field1Parse,
      field2: field2,
      field3: field3,
      field4: field4,
      field5: field5,
      user_id: userId,
      receiver_id: receiver_id,
    });
  } catch (e) {
    response(res, 400, true, e.message);
  }
});

app.post("/order", jwtF, async (req, res) => {
  const { project_id, payment_method, price } = req.body;

  const userId = req.decoded.id;

  try {
    if (!project_id) throw new Error("Field 'project_id' is required.");
    if (!payment_method) throw new Error("Field 'payment_method' is required.");
    if (typeof price === "undefined" || isNaN(price))
      throw new Error("Field 'price' is required and must be a number.");

    // Get Last Invoice
    var invoices = await getLastInvoice();

    var counterNumber = 1;

    if (invoices.length > 0) {
      counterNumber = invoices[0].no + 1;
    }

    // Generate random 5-digit number
    const randomNumber = Math.floor(Math.random() * 100000);
    const invoice = `CAPBRIDGE-INV${counterNumber}-${String(
      randomNumber
    ).padStart(5, "0")}`;

    // Get Project
    var projects = await getProject(project_id);

    if (projects.length == 0) throw new Error("PROJECT_NOT_FOUND");

    var projectUserId = projects[0].user_id;
    var projectTitle = projects[0].title;

    var inboxId;

    var paymentLogo;
    var paymentName;
    var paymentFee;
    var paymentAccess;
    var paymentType;
    var paymentExpire;

    if (payment_method != "billing") {
      // Get List Payment Method
      var paymentMethods = await listPaymentMethod(payment_method);

      for (const i in paymentMethods) {
        var paymentMethod = paymentMethods[i];

        paymentLogo = paymentMethod.logo;
        paymentName = paymentMethod.name;
        paymentFee = paymentMethod.fee;
      }

      var dataOrder = {
        invoice: invoice,
        no: counterNumber,
        project_id: project_id,
        cut_price: price,
        real_price: price,
      };

      const payload = {
        channel_id: payment_method,
        orderId: invoice,
        amount: parseInt(price), // Don't forget to parseInt for avoid anomaly midtrans
        app: "CAPBRIDGE",
        callbackUrl: process.env.CALLBACK_URL,
      };

      const config = {
        method: "POST",
        url: process.env.PAY_MIDTRANS,
        data: payload,
      };

      const result = await axios(config);

      // Store Order
      await storeOrder(dataOrder);

      if (["4"].includes(payment_method)) {
        paymentAccess = result.data.data.data.actions[0].url;
        paymentType = "emoney";
        paymentExpire = moment()
          .tz("Asia/Jakarta")
          .add(30, "minutes")
          .format("YYYY-MM-DD HH:mm:ss");
      } else {
        paymentAccess = result.data.data.data.vaNumber;
        paymentType = "va";
        paymentExpire = result.data.data.expire;
      }

      var dataInboxOrder = {
        Title: "Proyek [" + projectTitle + "]",
        Content:
          "Silahkan melakukan pembayaran lebih lanjut sebesar " +
          formatCurrency(price),
        field_1: paymentName,
        field_2: paymentFee,
        field_3: paymentAccess,
        field_4: paymentExpire,
        field_5: paymentType,
        field_6: paymentLogo,
        field_7: price,
        field_8: project_id,
        user_id: userId,
        receiver_id: projectUserId,
        type: "2",
      };

      if (projectUserId && connectedUsers[projectUserId]) {
        const socketId = connectedUsers[projectUserId];
        io.to(socketId).emit("payment-update", dataInboxOrder);
        console.log(`Sent update to user ${projectUserId}`);
      } else {
        console.log("User not connected or user_id missing");
      }

      // Store Order Inbox
      const inboxIdResult = await storeOrderInbox(dataInboxOrder);

      inboxId = inboxIdResult;
    }

    response(res, 200, false, "", {
      price: price,
      invoice: invoice,
      payment: {
        logo: paymentLogo,
        name: paymentName,
        fee: paymentFee,
        access: paymentAccess,
        expire: paymentExpire,
        type: paymentType,
      },
      project: {
        id: project_id,
        title: projectTitle,
      },
      inbox: {
        id: inboxId,
      },
    });
  } catch (e) {
    console.log(e);
    response(res, 400, true, e.message);
  }
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
