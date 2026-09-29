// Smoke test: boots the app on a temp DB and exercises the full student+admin flow.
// Run: DB_PATH=/tmp/chem-test.db ADMIN_EMAIL=a@t.local ADMIN_PASSWORD=Strong123! node tests/flow.test.js
//      (or simply: npm test — defaults are applied below)
process.env.DB_PATH = process.env.DB_PATH || '/tmp/chem-test.db';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.local';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminStrong123!';
const fs = require('fs');
try { fs.unlinkSync(process.env.DB_PATH); } catch {}

(async () => {
  await require('../src/seed')();
  const app = require('../src/app');
  const srv = app.listen(0);
  await new Promise(r => srv.on('listening', r));
  const B = `http://localhost:${srv.address().port}`;
  let cookie = '';
  const req = async (p, o = {}) => {
    const r = await fetch(B + p, { headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...o });
    const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { s: r.status, d: await r.json().catch(() => ({})) };
  };
  const check = (name, cond) => { console.log((cond ? '✅' : '❌') + ' ' + name); if (!cond) process.exitCode = 1; };

  let r = await req('/api/register', { method: 'POST', body: JSON.stringify({ full_name: 'أحمد محمد علي', email: 's@t.local', password: 'Pass1234', confirm: 'Pass1234', accept_terms: true }) });
  check('register', r.s === 200 && r.d.ok);
  r = await req('/api/attempts/start', { method: 'POST', body: JSON.stringify({}) });
  check('start exam', r.s === 200 && r.d.attempt_id);
  const aid = r.d.attempt_id;
  r = await req('/api/attempts/' + aid);
  check('60 questions, no answer leak', r.d.questions?.length === 60 && !('correct_choice' in r.d.questions[0]));
  await req('/api/attempts/' + aid + '/answer', { method: 'PUT', body: JSON.stringify({ question_id: r.d.questions[0].id, selected: 'B' }) });
  r = await req('/api/attempts/' + aid + '/pause', { method: 'POST', body: JSON.stringify({ minutes: 5 }) });
  check('pause', r.d.ok === true);
  r = await req('/api/attempts/' + aid + '/resume', { method: 'POST' });
  check('resume', r.d.ok === true);
  r = await req('/api/attempts/' + aid + '/submit', { method: 'POST' });
  check('submit + graded', r.s === 200 && typeof r.d.attempt?.score === 'number');
  r = await req('/api/attempts/' + aid + '/model');
  check('answer model after submit', Array.isArray(r.d) && r.d.length === 60 && !!r.d[0].correct);
  r = await req('/api/history');
  check('history persists', r.d.length === 1);

  cookie = '';
  r = await req('/api/login', { method: 'POST', body: JSON.stringify({ email: 'admin@test.local', password: 'AdminStrong123!' }) });
  check('admin login', r.d.ok && r.d.user.role === 'admin');
  r = await req('/api/admin/stats');
  check('admin stats', r.s === 200 && r.d.total_students === 1);
  cookie = 'x';
  r = await req('/api/admin/stats');
  check('RBAC blocks anonymous', r.s === 401);

  srv.close();
  console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
})().catch(e => { console.error(e); process.exit(1); });
