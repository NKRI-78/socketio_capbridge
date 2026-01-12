const { conn, connCreate, connPayment, connBot } = require("./config");

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

      connCreate.query(query, (e, result) => {
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

      connCreate.query(query, [projectId], (e, result) => {
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

      connCreate.query(
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

      connCreate.query(
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
  getUserIdByInvoice: async (invoice) => {
    const sql = `
    SELECT j.user_id
    FROM invoices i
    INNER JOIN jobs j ON j.id = i.investor_job_id
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

      connCreate.query(query, params, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  },

  ResetVal: (data) => {
    return new Promise((resolve, reject) => {
      const field_4 = data.field_4;
      const field_5 = data.field_5;
      const field_6 = data.field_6;
      const receiver_id = data.receiver_id;

      let query = "";
      let params = [];

      switch (field_6) {
        case "upload-ktp": {
          query = `
      UPDATE positions
      SET ktp_path = NULL
      WHERE id = ?
    `;
          console.log(field_5);
          console.log(query);
          params = [field_5];
          break;
        }
      }

      switch (field_4) {
        // -------------------------
        // DOKUMEN USER
        // -------------------------
        case "upload-ktp-pic": {
          query = `
      UPDATE ktps
      SET path = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }
        // -------------------------
        // DOKUMEN PERJABATAN (orang)
        // -------------------------
        case "slip-gaji": {
          query = `
      UPDATE pay_slips
      SET path = NULL
      WHERE user_id = ? 
    `;
          params = [receiver_id];
          break;
        }

        case "upload-npwp": {
          query = `
      UPDATE jobs
      SET npwp_path = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }

        case "surat-kuasa": {
          query = `
      UPDATE additional_docs
      SET path = NULL
      WHERE user_id = ? AND type = 'surat-kuasa'
    `;
          params = [receiver_id];
          break;
        }

        // -------------------------
        // DOKUMEN PERUSAHAAN
        // -------------------------
        case "akta-perubahan-terakhir": {
          query = `
      UPDATE companies
      SET latest_amendment_deed_path = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }

        case "akta-pendirian-perusahaan": {
          query = `
      UPDATE companies
      SET deed_of_incorporation = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }

        case "sk-pendirian-perusahaan": {
          query = `
      UPDATE companies
      SET certificate_of_company_est = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }

        case "sk-kumham-path": {
          query = `
      UPDATE companies
      SET sk_kumham_path = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }

        case "npwp-perusahaan": {
          query = `
      UPDATE companies
      SET npwp_path = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }

        case "siup": {
          query = `
      UPDATE companies
      SET siup = NULL
      WHERE user_id = ?
    `;
          params = [receiver_id];
          break;
        }

        case "tdp": {
          query = `
      UPDATE companies
      SET tdp = NULL
      WHERE user_id = ? 
    `;
          params = [receiver_id];
          break;
        }

        case "nib": {
          query = `
      UPDATE companies
      SET company_nib_path = NULL
      WHERE user_id = ? 
    `;
          params = [receiver_id];
          break;
        }

        case "sk-kumham-pendirian": {
          query = `
      UPDATE companies
      SET sk_kumham = NULL
      WHERE user_id = ? 
    `;
          params = [receiver_id];
          break;
        }

        case "sk-kumham-terakhir": {
          query = `
      UPDATE companies
      SET sk_kumham_last = NULL
      WHERE user_id = ? 
    `;
          params = [receiver_id];
          break;
        }

        case "laporan-keuangan": {
          query = `
      UPDATE companies
      SET financial_statement = NULL
      WHERE user_id = ? 
    `;
          params = [receiver_id];
          break;
        }

        case "rekening-koran": {
          query = `
      UPDATE companies
      SET bank_statement = NULL
      WHERE user_id = ? 
    `;
          params = [receiver_id];
          break;
        }

        default: {
          return resolve({ affectedRows: 0, message: "No action for field_4" });
        }
      }

      connCreate.query(query, params, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  },

  UpdateOrderPaid: (invoice) => {
    return new Promise((resolve, reject) => {
      var query = `UPDATE orders SET status = 4 WHERE invoice = ?`;

      connCreate.query(query, [invoice], (e, result) => {
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

      connCreate.query(query, [projectId], (e, result) => {
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

      connCreate.query(query, [projectId], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
};
