const { conn, connPayment, connBot } = require("./config");

module.exports = {
  loginBotSecret: (username) => {
    return new Promise((resolve, reject) => {
      var query = `SELECT id, username, password, role FROM bot_users WHERE username = ?`;

      connBot.query(query, [username], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  askBotSecret: (data) => {
    return new Promise((resolve, reject) => {
      const query = `
      INSERT INTO bot_messages 
        (sender_id, receiver_id, prefix, media, content, content_type, type) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

      connBot.query(
        query,
        [
          data?.sender_id ?? null,
          data?.receiver_id ?? null,
          data?.prefix ?? null,
          data?.media ?? null,
          data?.content ?? null,
          data?.content_type ?? null,
          data?.type ?? null,
        ],
        (err, result) => {
          if (err) {
            reject(new Error(`Query failed: ${err.message}`));
          } else {
            resolve(result);
          }
        }
      );
    });
  },

  answerBotSecret: () => {
    return new Promise((resolve, reject) => {
      var query = ` SELECT
      r.id AS request_id,
      r.content AS request_content,
      r.content_type AS request_content_type,
      r.media AS request_media,
      r.created_at AS request_time,
      r.sender_id AS request_sender,
      r.receiver_id AS request_receiver,
      a.id AS answer_id,
      a.content AS answer_content,
      a.content_type AS answer_content_type,
      a.media AS answer_media,
      a.created_at AS answer_time
    FROM bot_messages r
    LEFT JOIN bot_messages a
      ON a.type = 'answer'
      AND a.receiver_id = r.sender_id
      AND a.sender_id = r.receiver_id
      AND a.created_at > r.created_at
      AND NOT EXISTS (
        SELECT 1
        FROM bot_messages a2
        WHERE a2.type = 'answer'
          AND a2.receiver_id = r.sender_id
          AND a2.sender_id = r.receiver_id
          AND a2.created_at > r.created_at
          AND a2.created_at < a.created_at
      )
    WHERE r.type = 'request'
    ORDER BY r.created_at DESC;
    `;

      connBot.query(query, (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  listPaymentMethod: (id) => {
    return new Promise((resolve, reject) => {
      var query = `SELECT id, name, nameCode as name_code, logo, platform, fee FROM Channels WHERE id = ?`;

      connPayment.query(query, [id], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  getLastInvoice: () => {
    return new Promise((resolve, reject) => {
      var query = `SELECT no FROM orders ORDER BY id DESC LIMIT 1`;

      conn.query(query, (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  getProject: (projectId) => {
    return new Promise((resolve, reject) => {
      var query = `SELECT p.title, c.user_id FROM projects p 
      INNER JOIN companies c ON c.uid = p.company_id 
      WHERE p.uid = ?`;

      conn.query(query, [projectId], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  storeOrder: (data) => {
    return new Promise((resolve, reject) => {
      var query = `INSERT INTO orders (invoice, no, project_id, cut_price, real_price) VALUES (?, ?, ?, ?, ?)`;

      conn.query(
        query,
        [
          data.invoice,
          data.no,
          data.project_id,
          data.cut_price,
          data.real_price,
        ],
        (e, result) => {
          if (e) {
            reject(new Error(e));
          } else {
            resolve(result);
          }
        }
      );
    });
  },
  storeOrderInbox: (data) => {
    return new Promise((resolve, reject) => {
      var query = `INSERT INTO inboxes (title, content, field_1, field_2, field_3, field_4, field_5, field_6, field_7, field_8, user_id, receiver_id, type) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      conn.query(
        query,
        [
          data.title,
          data.content,
          data.field_1,
          data.field_2,
          data.field_3,
          data.field_4,
          data.field_5,
          data.field_6,
          data.field_7,
          data.field_8,
          data.user_id,
          data.receiver_id,
          data.type,
        ],
        (e, result) => {
          if (e) {
            reject(new Error(e));
          } else {
            resolve(result.insertId);
          }
        }
      );
    });
  },
  getUserIdByCompany: async (invoice) => {
    const sql = `
    SELECT i.project_uid AS project_id, c.user_id
    FROM invoices i
    INNER JOIN projects  p ON p.uid = i.project_uid
    INNER JOIN companies c ON c.uid = p.company_id
    WHERE i.order_id = ?
  `;

    const [rows] = await conn.query(sql, [invoice]);
    return rows;
  },
  StoreInbox: (data) => {
    return new Promise((resolve, reject) => {
      const query = `
      INSERT INTO \`inboxes\`
        (\`title\`, \`content\`, \`user_id\`, \`receiver_id\`,
         \`field_1\`, \`field_2\`, \`field_3\`, \`field_4\`, \`field_5\`, \`data\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

      const params = [
        data.title,
        data.content,
        data.user_id,
        data.receiver_id,
        data.field1,
        data.field2,
        data.field3,
        data.field4,
        data.field5,
        data.data,
      ];

      conn.query(query, params, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  },

  UpdateOrderPaid: (invoice) => {
    return new Promise((resolve, reject) => {
      var query = `UPDATE orders SET status = 4 WHERE invoice = ?`;

      conn.query(query, [invoice], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  UpdateProjectPaid: (projectId) => {
    return new Promise((resolve, reject) => {
      var query = `UPDATE projects SET status = 4 WHERE uid = ?`;

      conn.query(query, [projectId], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  UpdateInboxPaid: (projectId) => {
    return new Promise((resolve, reject) => {
      var query = `UPDATE inboxes SET status = 4 WHERE field_8 = ?`;

      conn.query(query, [projectId], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
};
