#!/bin/bash
set -euo pipefail
SECRET="${TURN_AUTH_SECRET:-eLNuaVO0Jr3lBSxYqiHRSCeLL5LQkSzt}"
read -r USER CRED < <(node -e "
const { createHmac, randomUUID } = require('crypto');
const s = process.argv[1];
const u = String(Math.floor(Date.now() / 1000) + 86400) + ':' + randomUUID().slice(0, 8);
const c = createHmac('sha1', s).update(u).digest('base64');
console.log(u + ' ' + c);
" "$SECRET")
echo "Testing TURN user=$USER host=${TURN_HOST:-turn.neeklo.ru}"
turnutils_uclient -v -y -u "$USER" -w "$CRED" "${TURN_HOST:-turn.neeklo.ru}" 2>&1 | tail -25
