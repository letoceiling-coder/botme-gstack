module.exports = {
  apps: [
    {
      name: 'agent-botme-api',
      cwd: '/var/www/agent.neeklo.ru',
      script: 'pnpm',
      args: '--filter @botme/api start',
      env: {
        NODE_ENV: 'production',
        API_PORT: '3110',
      },
    },
    {
      name: 'agent-botme-worker',
      cwd: '/var/www/agent.neeklo.ru',
      script: 'pnpm',
      args: '--filter @botme/worker start',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'agent-botme-web',
      cwd: '/var/www/agent.neeklo.ru',
      script: 'pnpm',
      args: '--filter @botme/web preview --host 0.0.0.0 --port 4173 --strictPort',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
