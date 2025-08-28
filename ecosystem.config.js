module.exports = {
  apps: [{
    name: 'prompt-machine-api',
    script: './api/src/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/api-error.log',
    out_file: './logs/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    merge_logs: true,
    max_memory_restart: '500M',
    // Auto restart if crashes
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 5000,
    // Watch for file changes (disable in production)
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git'],
  }]
};
