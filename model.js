const conn = require("./config");

module.exports = {
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
