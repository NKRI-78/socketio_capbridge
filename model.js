const { conn, connPayment } = require("./config");

module.exports = {
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
  getUserIdByCompany: (invoice) => {
    return new Promise((resolve, reject) => {
      var query = `SELECT o.project_id, c.user_id 
      FROM orders o
      INNER JOIN projects p ON p.uid = o.project_id
      INNER JOIN companies c ON c.uid = p.company_id 
      WHERE o.invoice = ?`;

      conn.query(query, [invoice], (e, result) => {
        if (e) {
          reject(new Error(e));
        } else {
          resolve(result);
        }
      });
    });
  },
  StoreInbox: (data) => {
    return new Promise((resolve, reject) => {
      var query = `INSERT INTO inboxes (title, content, user_id, receiver_id, field_1, field_2, field_3, field_4, field_5) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      conn.query(
        query,
        [
          data.title,
          data.content,
          data.user_id,
          data.receiver_id,
          data.field1,
          data.field2,
          data.field3,
          data.field4,
          data.field5,
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
