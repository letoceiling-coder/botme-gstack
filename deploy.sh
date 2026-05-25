#!/bin/bash
set -e

SERVER="root@212.67.9.173"
REMOTE="/var/www/agent.neeklo.ru"

git add .
git commit -m "deploy"
git push

ssh "$SERVER" "
cd $REMOTE &&
git pull origin main &&
pnpm install &&
pnpm build &&
pnpm db:migrate:deploy &&
pm2 restart ecosystem.config.cjs
"
