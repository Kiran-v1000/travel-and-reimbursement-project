// pm2 process file for Linux production: one API worker per CPU core, zero-downtime reloads.
//   pm2 start ecosystem.config.cjs --env production
//   pm2 reload voyage-api        # rolling restart after a deploy
// Background jobs are safe to run in every worker (escalation uses FOR UPDATE SKIP LOCKED).
module.exports = {
  apps: [
    {
      name: 'voyage-api',
      script: 'src/server.js',
      exec_mode: 'cluster',
      instances: process.env.API_INSTANCES || 'max',
      max_memory_restart: '700M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      env_production: {
        NODE_ENV: 'production',
        REQUEST_LOGGING: 'false',
      },
    },
  ],
};
