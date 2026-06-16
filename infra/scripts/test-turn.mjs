import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

const secret = process.env.TURN_AUTH_SECRET ?? 'eLNuaVO0Jr3lBSxYqiHRSCeLL5LQkSzt';
const host = process.env.TURN_HOST ?? 'turn.neeklo.ru';
const username = `${Math.floor(Date.now() / 1000) + 86400}:${randomUUID().slice(0, 8)}`;
const credential = createHmac('sha1', secret).update(username).digest('base64');
console.log('user', username);
console.log('cred', credential);
try {
  const out = execSync(
    `turnutils_uclient -v -y -u ${JSON.stringify(username)} -w ${JSON.stringify(credential)} ${host}`,
    { encoding: 'utf8', timeout: 20000 },
  );
  console.log(out.split('\n').slice(-8).join('\n'));
} catch (e) {
  const err = e;
  console.log(String(err.stdout ?? '').split('\n').slice(-8).join('\n'));
  console.log(String(err.stderr ?? '').split('\n').slice(-8).join('\n'));
  process.exit(err.status ?? 1);
}
