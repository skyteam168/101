/** PM2: restaurant-mcp（Streamable HTTP，默认 3100） */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'restaurant-mcp',
      cwd: __dirname,
      script: 'dist/http.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // 实际密钥在 .env，由进程内 loadConfig 读取
      watch: false,
      max_memory_restart: '200M',
    },
  ],
};
