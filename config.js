require("dotenv/config");

const mysql = require("mysql2");

const env = process.env.NODE_ENV;
const isProd = env === "production";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: isProd ? process.env.DB_NAME : process.env.DB_NAME_STAGING,
});

const conn = pool.promise();

const connCreate = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: isProd ? process.env.DB_NAME : process.env.DB_NAME_STAGING,
});

const connPayment = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_PG,
});

const connBot = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_BOT,
});

module.exports = { conn, connCreate, connPayment, connBot };
