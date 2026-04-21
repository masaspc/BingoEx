module.exports = {
  apps: [
    {
      name: "bingoex",
      script: "server/index.js",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      node_args: "--max-old-space-size=384",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
