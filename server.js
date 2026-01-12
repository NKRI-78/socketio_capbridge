const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { conn } = require("./config");
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
  loginBotSecret,
  askBotSecret,
  answerBotSecret,
  ResetVal,
} = require("./model");
const { response } = require("./response");
const { jwtF } = require("./jwt");
const { formatCurrency } = require("./config");
const { checkPasswordEncrypt } = require("./utils");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  },
});

app.use(cors());
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

app.post("/login-bot-secret", async (req, res) => {
  const { username, password } = req.body;
  try {
    if (typeof username == "undefined" || username == "")
      throw new Error("Field username is required");

    if (typeof password == "undefined" || password == "")
      throw new Error("Field password is required");

    var login = await loginBotSecret(username);

    if (login.length == 0) throw new Error("User not found");

    var passwordHash = await checkPasswordEncrypt(password, login[0].password);

    if (!passwordHash) throw new Error("Password does't match");

    var payload = {
      id: login[0].id,
      authorized: true,
    };

    var token = jwt.sign(payload, process.env.JWT_SECRET);
    var refreshToken = jwt.sign(payload, process.env.JWT_SECRET);

    response(res, 200, false, "", {
      token: token,
      refresh_token: refreshToken,
      user: {
        id: login[0].id,
        name: login[0].username,
        role: login[0].role == 1 ? "admin" : "user",
      },
    });
  } catch (e) {
    response(res, 400, true, e.message);
  }
});

app.post("/ask-bot-secret", async (req, res) => {
  const { sender_id, receiver_id, prefix, media, content, content_type, type } =
    req.body;

  try {
    var data = {
      sender_id: sender_id,
      receiver_id: receiver_id,
      prefix: prefix,
      media: media,
      content: content,
      content_type: content_type,
      type: type,
    };

    await askBotSecret(data);

    response(res, 200, false, "", {
      sender_id: sender_id,
      receiver_id: receiver_id,
      prefix: prefix,
      media: media,
      content: content,
      content_type: content_type,
      type: type,
    });
  } catch (e) {
    response(res, 400, true, e.message);
  }
});

app.get("/answer-bot-secret", async (_, res) => {
  try {
    var answer = await answerBotSecret();

    response(res, 200, false, "", {
      answer,
    });
  } catch (e) {
    response(res, 400, true, e.message);
  }
});

// ---- helpers
const DB_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label = "op") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout: ${label} after ${ms}ms`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function normalizeStatus(data) {
  const raw = String(
    data?.status ?? data?.transaction_status ?? data?.transactionStatus ?? ""
  )
    .trim()
    .toUpperCase();
  if (raw === "SETTLEMENT") return "PAID";
  if (
    raw === "CAPTURE" &&
    String(data?.fraud_status || "").toUpperCase() === "ACCEPT"
  ) {
    return "PAID";
  }
  return raw;
}

// ---- route: ACK FIRST, then process in background
app.post("/project-payment-callback", (req, res) => {
  const data = req.body;
  console.log("Callback Success Socket");

  // Respond immediately so Midtrans doesn't retry and your server never "hangs"
  res.status(200).json({ ok: true });

  // Do the heavy work asynchronously (with timeouts and step logs)
  (async () => {
    try {
      console.log("[cb] handle start");
      await withTimeout(
        handleProjectPaymentCallback(data),
        DB_TIMEOUT_MS,
        "handleProjectPaymentCallback"
      );
      console.log("[cb] core handled");

      if (normalizeStatus(data) === "PAID") {
        console.log("[cb] post-PAID side-effects start");

        // Get userId
        let userId = "";
        try {
          const orders = await withTimeout(
            getUserIdByCompany(data.order_id),
            4000,
            "getUserIdByCompany"
          );
          userId = orders?.[0]?.user_id || "";
          console.log("[cb]: userId", userId);
        } catch (e) {
          console.warn("[warn] getUserIdByCompany:", e.message);
        }

        if (userId && connectedUsers?.[userId]) {
          const socketId = global.connectedUsers[userId];
          io.to(socketId).emit("payment-update", data);
          console.log(`[cb] sent update to user ${userId}`);
        } else {
          console.log("[cb] user not connected or missing user_id");
        }

        console.log("[cb] post-PAID side-effects done");
      }
    } catch (err) {
      console.error("[cb] processing error:", err);
    }
  })();
});

// ---- DB snapshot: fire-and-forget (used by handler)
async function saveCallbackSnapshot(orderId, payload) {
  try {
    await withTimeout(
      conn.query(
        `UPDATE invoices
           SET raw_response = JSON_SET(COALESCE(raw_response, JSON_OBJECT()),
                                       '$.callback', CAST(? AS JSON))
         WHERE provider='midtrans' AND order_id=?`,
        [JSON.stringify(payload), orderId]
      ),
      4000,
      "saveCallbackSnapshot"
    );
  } catch (e) {
    console.warn("[warn] saveCallbackSnapshot:", e.message);
  }
}

/**
 * Core Midtrans handler: validates, idempotent check, and calls SPs.
 * Throws on unexpected states; caller decides HTTP response (we ACK first).
 */
async function handleProjectPaymentCallback(data) {
  if (!data) throw new Error("nil payload");

  const orderId = String(data.order_id ?? data.orderId ?? "").trim();
  if (!orderId) throw new Error("order_id is required");

  const status = normalizeStatus(data);

  console.log("[cb] select invoice");
  const [rows] = await withTimeout(
    conn.query(
      "SELECT invoice_status FROM invoices WHERE provider='midtrans' AND order_id=? LIMIT 1",
      [orderId]
    ),
    4000,
    "select invoice"
  );
  const invStatus = rows?.[0]?.invoice_status
    ? String(rows[0].invoice_status)
    : "";
  if (!invStatus) throw new Error(`invoice not found for order_id=${orderId}`);

  // idempotent shortcuts
  if (invStatus === "PAID" && status === "PAID") {
    saveCallbackSnapshot(orderId, data); // no await
    console.log("[cb] already paid → skip");
    return;
  }
  if (invStatus !== "ISSUED" && status !== "PAID") {
    saveCallbackSnapshot(orderId, data);
    console.log("[cb] not ISSUED and not PAID → skip");
    return;
  }

  // apply SPs (bounded)
  try {
    if (status === "PAID") {
      console.log("[cb] call sp_mark_invoice_paid");
      await withTimeout(
        conn.query("CALL sp_mark_invoice_paid(?,?,?)", [
          "midtrans",
          orderId,
          null,
        ]),
        5000,
        "sp_mark_invoice_paid"
      );
    } else {
      console.log("[cb] call sp_cancel_invoice");
      await withTimeout(
        conn.query("CALL sp_cancel_invoice(?,?,?)", [
          "midtrans",
          orderId,
          status,
        ]),
        5000,
        "sp_cancel_invoice"
      );
    }
  } catch (err) {
    if (err && (err.errno === 1644 || err.code === "ER_SIGNAL_EXCEPTION")) {
      console.warn("[warn] SIGNAL (idempotent):", err.message);
    } else {
      throw err;
    }
  }

  saveCallbackSnapshot(orderId, data); // non-blocking
  console.log("[cb] handler done");
}

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
    field_1,
    field_2,
    field_3,
    field_4,
    field_5,
    data, // can be object OR a JSON string
    receiver_id,
  } = req.body;

  const userId = req.decoded.id;

  try {
    if (!title) throw new Error("Field type title is required");
    if (!content) throw new Error("Field content is required");
    if (!receiver_id) throw new Error("Field receiver_id is required");

    // --- normalize field_1 (divide by 2 if numeric, else keep null/empty) ---
    let field1Parse = null;
    if (field_1 !== "" && typeof field_1 !== "undefined") {
      const parsed = parseInt(field_1, 10);
      if (Number.isNaN(parsed)) throw new Error("field_1 harus berupa angka");
      field1Parse = Math.floor(parsed / 2);
    }

    // --- normalize data: accept object or JSON string ---
    let dataObj = null;
    if (typeof data === "string" && data.trim() !== "") {
      try {
        dataObj = JSON.parse(data); // client sent stringified JSON
      } catch {
        throw new Error("data must be valid JSON");
      }
    } else if (data && typeof data === "object") {
      dataObj = data; // client sent an object
    }

    // If your DB column is TEXT/VARCHAR -> stringify once
    // If the column is JSON/JSONB, you can pass object with some drivers,
    // but stringifying works everywhere.
    const dataJsonString = dataObj ? JSON.stringify(dataObj) : null;

    const dataInbox = {
      title,
      content,
      user_id: userId,
      receiver_id,
      field1: field1Parse,
      field2: field_2 ?? null,
      field3: field_3 ?? null,
      field4: field_4 ?? null,
      field5: field_5 ?? null,
      data: dataJsonString, // <- STRING ready for DB
    };

    switch (field_4) {
      // -------------------------
      // DOKUMEN PERJABATAN (orang)
      // -------------------------
      case "slip-gaji":
      case "surat-kuasa":
      case "upload-ktp":
      case "upload-ktp-pic":
      case "upload-npwp": {
        await ResetVal({ field_4, receiver_id });
        break;
      }

      // -------------------------
      // DOKUMEN PERUSAHAAN
      // -------------------------
      case "akta-perubahan-terakhir":
      case "akta-pendirian-perusahaan":
      case "sk-pendirian-perusahaan":
      case "sk-kumham-path":
      case "npwp-perusahaan":
      case "siup":
      case "tdp":
      case "nib":
      case "sk-kumham-pendirian":
      case "sk-kumham-terakhir":
      case "laporan-keuangan":
      case "rekening-koran": {
        await ResetVal({ field_4, receiver_id });
        break;
      }

      default: {
        break;
      }
    }

    await StoreInbox(dataInbox);

    if (receiver_id && connectedUsers[receiver_id]) {
      io.to(connectedUsers[receiver_id]).emit("inbox-update", dataObj);
      console.log(`Sent update to user ${receiver_id}`);
    } else {
      console.log("User not connected or user_id missing");
    }

    response(res, 200, false, "", {
      title,
      content,
      field1: field1Parse,
      field2: field_2,
      field3: field_3,
      field4: field_4,
      field5: field_5,
      data: dataObj,
      user_id: userId,
      receiver_id,
    });
  } catch (e) {
    console.log(e);
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
