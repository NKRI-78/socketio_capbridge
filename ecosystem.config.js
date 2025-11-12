module.exports = {
  apps: [
    {
      name: "socketio-capbridge",
      script: "server.js",
      env: { NODE_ENV: "production", PORT: 6262 },
    },
    {
      name: "socketio-capbridge-staging",
      script: "server.js",
      env: { NODE_ENV: "staging", PORT: 6261 },
    },
  ],
};
