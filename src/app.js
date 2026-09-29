// Main Express app: secure API + static frontend
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const argon2 = require('argon2');
const { db, getSetting, setSetting } = require('./db');

const app = express();
const now = () => Date.now();
const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;

// ---------- middleware ----------
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('hex'); }

function getSessionUser(req) {
  const sid = req.cookies.sid;
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(hashToken(sid));
  if (!s || s.expires_at < now()) return null;
  const u = db.prepare('SELECT id, full_name, email, role, status, created_at FROM users WHERE id=?').get(s.user_id);
  return u || null;
}
app.use((req, res, next) => { req.user = getSessionUser(req); next(); });

const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  if (req.user.status === 'banned') return res.status(403).json({ error: 'banned', message: 'تم إيقاف حسابك. تواصل مع الإدارة.' });
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
  next();
};
function audit(admin_id, action, target = '', meta = '') {
  try { db.prepare('INSERT INTO audit_logs(admin_id,action,target,meta,created_at) VALUES(?,?,?,?,?)').run(admin_id, action, target, meta, now()); } catch {}
}
function activeBan(userId) {
  const t = now();
  return db.prepare(`SELECT * FROM bans WHERE user_id=? AND active=1 AND starts_at<=? AND (is_permanent=1 OR ends_at IS NULL OR ends_at>?) ORDER BY id DESC LIMIT 1`).get(userId, t, t);
}
function gradeLabel(pct) {
  try {
    const g = JSON.parse(getSetting('grading', '[]')).sort((a, b) => b.min - a.min);
    for (const r of g) if (pct >= r.min) return r.label;
  } catch {}
  return pct >= 90 ? 'ممتاز' : pct >= 75 ? 'جيد جدًا' : pct >= 60 ? 'جيد' : pct >= 50 ? 'مقبول' : 'يحتاج تحسين';
}
// Auto-resume expired pauses + auto-submit expired attempts (server-authoritative)
function syncAttempt(a) {
  if (!a || a.status === 'submitted') return a;
  const t = now();
  let att = db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(a.id);
  // auto resume pause
  if (att.status === 'paused' && att.paused_until && t >= att.paused_until) {
    resumeAttempt(att, true);
    att = db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(a.id);
  }
  // auto submit on expiry (only if not paused)
  if (att.status !== 'paused') {
    const remaining = Math.floor((att.ends_at - t) / 1000);
    if (remaining <= 0) { submitAttempt(att, true); att = db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(a.id); }
  }
  return att;
}
function remainingSec(att) {
  const t = now();
  if (att.status === 'submitted') return 0;
  if (att.status === 'paused' && att.paused_until) {
    const pe = db.prepare('SELECT * FROM pause_events WHERE attempt_id=? ORDER BY id DESC LIMIT 1').get(att.id);
    if (pe) return Math.max(0, Math.floor((att.ends_at - pe.started_at) / 1000));
    return Math.max(0, Math.floor((att.ends_at - t) / 1000));
  }
  return Math.max(0, Math.floor((att.ends_at - t) / 1000));
}
function resumeAttempt(att, auto = false) {
  const t = now();
  const pe = db.prepare('SELECT * FROM pause_events WHERE attempt_id=? ORDER BY id DESC LIMIT 1').get(att.id);
  if (!pe) { db.prepare("UPDATE exam_attempts SET status='in_progress', paused_until=NULL WHERE id=?").run(att.id); return; }
  const actualEnd = Math.min(t, pe.ends_at);
  const actualSec = Math.max(0, Math.floor((actualEnd - pe.started_at) / 1000));
  const frozen = Math.max(0, att.ends_at - pe.started_at);
  const newEnds = t + frozen;
  db.prepare('UPDATE pause_events SET ends_at=?, duration_sec=? WHERE id=?').run(actualEnd, actualSec, pe.id);
  db.prepare("UPDATE exam_attempts SET status='in_progress', paused_until=NULL, ends_at=?, total_paused_sec=total_paused_sec+? WHERE id=?").run(newEnds, actualSec, att.id);
}
function submitAttempt(att, auto = false) {
  if (att.status === 'submitted') return att;
  // close open pause first
  if (att.status === 'paused') resumeAttempt(att, true);
  att = db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(att.id);
  const t = now();
  const qs = db.prepare('SELECT id, correct_choice FROM questions WHERE exam_id=?').all(att.exam_id);
  const ans = db.prepare('SELECT question_id, selected_choice FROM answers WHERE attempt_id=?').all(att.id);
  const map = new Map(ans.map(x => [x.question_id, x.selected_choice]));
  let correct = 0, wrong = 0, unanswered = 0;
  for (const q of qs) {
    const s = map.get(q.id);
    if (!s) unanswered++;
    else if (s === q.correct_choice) correct++;
    else wrong++;
  }
  const total = qs.length, pct = total ? Math.round((correct / total) * 1000) / 10 : 0;
  const label = gradeLabel(pct);
  const used = Math.floor((t - att.started_at - (att.total_paused_sec * 1000)) / 1000);
  db.prepare(`UPDATE exam_attempts SET status='submitted', submitted_at=?, time_used_sec=?, score=?, total=?, percentage=?, grade_label=? WHERE id=?`)
    .run(t, Math.max(0, used), correct, total, pct, label, att.id);
  return db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(att.id);
}

// ---------- rate limits ----------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'محاولات كثيرة. حاول بعد 15 دقيقة.' } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: { error: 'تسجيلات كثيرة من هذا الجهاز.' } });

// ---------- helpers ----------
function setSession(res, userId) {
  const t = newToken();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(hashToken(t), userId, now(), now() + SESSION_TTL);
  res.cookie('sid', t, { httpOnly: true, sameSite: 'Lax', maxAge: SESSION_TTL, path: '/' });
}
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- public ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/terms', (req, res) => {
  const t = db.prepare('SELECT id, version, body FROM terms ORDER BY id DESC LIMIT 1').get();
  res.json(t || {});
});
app.get('/api/settings-public', (req, res) => {
  res.json({
    registration_enabled: getSetting('registration_enabled', '1') === '1',
    maintenance_mode: getSetting('maintenance_mode', '0') === '1',
    exam_duration_min: +getSetting('exam_duration_min', '180'),
    leaderboard_threshold: +getSetting('leaderboard_threshold', '51'),
    leaderboard_limit: +getSetting('leaderboard_limit', '10')
  });
});
app.get('/api/leaderboard', (req, res) => {
  const threshold = +getSetting('leaderboard_threshold', '51');
  const limit = Math.min(50, +getSetting('leaderboard_limit', '10') || 10);
  // best attempt per user above threshold; tie-break: lower time_used_sec
  const rows = db.prepare(`
    SELECT u.full_name AS name, a.score, a.total, a.percentage, a.time_used_sec, a.submitted_at
    FROM exam_attempts a JOIN users u ON u.id=a.user_id
    WHERE a.status='submitted' AND a.score >= ? AND u.role='student' AND u.status='active'
    ORDER BY a.score DESC, a.time_used_sec ASC, a.submitted_at ASC LIMIT ?`).all(threshold, limit);
  res.json({ threshold, rule: 'الترتيب حسب الدرجة، وعند التعادل يُقدَّم من أنهى في وقت أقل.', rows });
});

// ---------- auth ----------
app.post('/api/register', registerLimiter, async (req, res) => {
  try {
    if (getSetting('registration_enabled', '1') !== '1') return res.status(403).json({ error: 'التسجيل متوقف حاليًا' });
    const { full_name, email, password, confirm, accept_terms } = req.body || {};
    const name = (full_name || '').trim();
    const em = (email || '').trim().toLowerCase();
    if (!name || name.split(/\s+/).length < 2) return res.status(400).json({ error: 'اكتب الاسم الثلاثي كاملًا' });
    if (!emailRe.test(em)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    if (!password || password.length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'كلمة المرور يجب أن تحتوي حروفًا وأرقامًا' });
    if (password !== confirm) return res.status(400).json({ error: 'تأكيد كلمة المرور غير متطابق' });
    if (!accept_terms) return res.status(400).json({ error: 'يجب الموافقة على شروط استخدام المنصة' });
    if (db.prepare('SELECT id FROM users WHERE email=?').get(em)) return res.status(409).json({ error: 'هذا البريد مسجل بالفعل' });
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const t = now();
    const r = db.prepare('INSERT INTO users(full_name,email,password_hash,role,status,created_at) VALUES(?,?,?,?,?,?)').run(name, em, hash, 'student', 'active', t);
    db.prepare('INSERT INTO profiles(user_id) VALUES(?)').run(r.lastInsertRowid);
    const terms = db.prepare('SELECT id FROM terms ORDER BY id DESC LIMIT 1').get();
    if (terms) db.prepare('INSERT INTO terms_acceptances(user_id,terms_id,accepted_at) VALUES(?,?,?)').run(r.lastInsertRowid, terms.id, t);
    setSession(res, r.lastInsertRowid);
    res.json({ ok: true, user: { id: r.lastInsertRowid, full_name: name, email: em, role: 'student' } });
  } catch (e) { res.status(500).json({ error: 'خطأ في التسجيل' }); }
});
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const em = ((req.body || {}).email || '').trim().toLowerCase();
    const pw = (req.body || {}).password || '';
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(em);
    if (!u || !(await argon2.verify(u.password_hash, pw).catch(() => false)))
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    const ban = activeBan(u.id);
    if (ban || u.status === 'banned')
      return res.status(403).json({ error: 'banned', message: 'تم إيقاف حسابك' + (ban && ban.reason ? ': ' + ban.reason : '') + '. تواصل مع الإدارة.' });
    db.prepare('DELETE FROM sessions WHERE user_id=? AND expires_at<?').run(u.id, now());
    setSession(res, u.id);
    audit(u.role === 'admin' ? u.id : null, 'login', u.email, JSON.stringify({ role: u.role }));
    res.json({ ok: true, user: { id: u.id, full_name: u.full_name, email: u.email, role: u.role } });
  } catch (e) { res.status(500).json({ error: 'خطأ في تسجيل الدخول' }); }
});
app.post('/api/logout', (req, res) => {
  const sid = req.cookies.sid;
  if (sid) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(sid));
  res.clearCookie('sid', { path: '/' });
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const ban = activeBan(req.user.id);
  res.json({ user: { ...req.user, banned: !!ban } });
});

// ---------- student ----------
app.get('/api/exams/active', requireAuth, (req, res) => {
  const exams = db.prepare('SELECT id,title,grade,subject,chapter,duration_min,total_questions AS question_count,pause_enabled,max_pause_min FROM exams WHERE is_active=1').all();
  // attach last result + rank info
  const out = exams.map(e => {
    const last = db.prepare('SELECT score,total,percentage,grade_label,submitted_at FROM exam_attempts WHERE user_id=? AND exam_id=? AND status=? ORDER BY submitted_at DESC LIMIT 1').get(req.user.id, e.id, 'submitted');
    const count = db.prepare('SELECT COUNT(*) c FROM questions WHERE exam_id=?').get(e.id).c;
    return { ...e, question_count: count, last_result: last || null };
  });
  res.json(out);
});
app.get('/api/dashboard', requireAuth, (req, res) => {
  const attempts = db.prepare('SELECT * FROM exam_attempts WHERE user_id=? AND status=? ORDER BY submitted_at DESC').all(req.user.id, 'submitted');
  const best = attempts.length ? Math.max(...attempts.map(a => a.score)) : 0;
  const avg = attempts.length ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length * 10) / 10 : 0;
  const exam = db.prepare('SELECT * FROM exams WHERE is_active=1 LIMIT 1').get();
  let rank = null;
  if (exam && attempts.length) {
    const myBest = db.prepare('SELECT MAX(score) m FROM exam_attempts WHERE user_id=? AND exam_id=? AND status=?').get(req.user.id, exam.id, 'submitted').m;
    const better = db.prepare('SELECT COUNT(DISTINCT user_id) c FROM exam_attempts WHERE exam_id=? AND status=? AND score>?').get(exam.id, 'submitted', myBest).c;
    rank = better + 1;
  }
  const unread = db.prepare('SELECT COUNT(*) c FROM notification_recipients WHERE user_id=? AND is_read=0').get(req.user.id).c;
  const ongoing = db.prepare("SELECT id FROM exam_attempts WHERE user_id=? AND status IN ('in_progress','paused') ORDER BY id DESC LIMIT 1").get(req.user.id);
  res.json({ attempts: attempts.length, best, avg, rank, unread, last: attempts[0] || null, ongoing_attempt_id: ongoing ? ongoing.id : null, exam });
});
app.post('/api/attempts/start', requireAuth, (req, res) => {
  const examId = +(req.body || {}).exam_id || db.prepare('SELECT id FROM exams WHERE is_active=1 LIMIT 1').get()?.id;
  if (!examId) return res.status(404).json({ error: 'لا يوجد امتحان متاح' });
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND is_active=1').get(examId);
  if (!exam) return res.status(404).json({ error: 'الامتحان غير متاح' });
  let open = db.prepare("SELECT * FROM exam_attempts WHERE user_id=? AND exam_id=? AND status IN ('in_progress','paused') ORDER BY id DESC LIMIT 1").get(req.user.id, examId);
  if (open) { open = syncAttempt(open); return res.json({ attempt_id: open.id, resumed: true }); }
  const t = now();
  const durMin = +(getSetting('exam_duration_min', String(exam.duration_min))) || exam.duration_min;
  const r = db.prepare(`INSERT INTO exam_attempts(user_id,exam_id,status,started_at,ends_at) VALUES(?,?, 'in_progress',?,?)`).run(req.user.id, examId, t, t + durMin * 60 * 1000);
  res.json({ attempt_id: r.lastInsertRowid, resumed: false });
});
function attemptQuestions(attemptId, includeAnswers) {
  const att = db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(attemptId);
  const qs = db.prepare('SELECT id,body,image_url,choice_a,choice_b,choice_c,choice_d,difficulty,chapter,sort_order' + (includeAnswers ? ',correct_choice,explanation' : '') + ' FROM questions WHERE exam_id=? ORDER BY sort_order').all(att.exam_id);
  const ans = db.prepare('SELECT question_id,selected_choice,marked FROM answers WHERE attempt_id=?').all(attemptId);
  const m = new Map(ans.map(a => [a.question_id, a]));
  return qs.map((q, i) => ({ n: i + 1, selected: m.get(q.id)?.selected_choice || null, marked: !!m.get(q.id)?.marked, ...q }));
}
app.get('/api/attempts/:id', requireAuth, (req, res) => {
  let att = db.prepare('SELECT * FROM exam_attempts WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!att) return res.status(404).json({ error: 'المحاولة غير موجودة' });
  att = syncAttempt(att);
  if (att.status === 'submitted') return res.json({ attempt: att, submitted: true });
  const exam = db.prepare('SELECT * FROM exams WHERE id=?').get(att.exam_id);
  res.json({
    attempt: { id: att.id, exam_id: att.exam_id, status: att.status, remaining_sec: remainingSec(att), paused_until: att.paused_until, pause_count: att.pause_count },
    exam: { title: exam.title, chapter: exam.chapter, pause_enabled: exam.pause_enabled && getSetting('pause_enabled', '1') === '1', max_pause_min: exam.max_pause_min },
    questions: attemptQuestions(att.id, false)
  });
});
app.put('/api/attempts/:id/answer', requireAuth, (req, res) => {
  let att = db.prepare('SELECT * FROM exam_attempts WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!att) return res.status(404).json({ error: 'غير موجود' });
  att = syncAttempt(att);
  if (att.status !== 'in_progress') return res.status(400).json({ error: att.status === 'paused' ? 'الامتحان متوقف مؤقتًا' : 'تم تسليم الامتحان' });
  const { question_id, selected, marked } = req.body || {};
  const q = db.prepare('SELECT id FROM questions WHERE id=? AND exam_id=?').get(+question_id, att.exam_id);
  if (!q) return res.status(400).json({ error: 'سؤال غير صالح' });
  if (selected && !['A', 'B', 'C', 'D'].includes(selected)) return res.status(400).json({ error: 'اختيار غير صالح' });
  const cur = db.prepare('SELECT * FROM answers WHERE attempt_id=? AND question_id=?').get(att.id, q.id);
  if (cur) db.prepare('UPDATE answers SET selected_choice=COALESCE(?,selected_choice), marked=COALESCE(?,marked), updated_at=? WHERE id=?')
    .run(selected || null, marked === undefined ? cur.marked : (marked ? 1 : 0), now(), cur.id);
  else db.prepare('INSERT INTO answers(attempt_id,question_id,selected_choice,marked,updated_at) VALUES(?,?,?,?,?)').run(att.id, q.id, selected || null, marked ? 1 : 0, now());
  res.json({ ok: true, remaining_sec: remainingSec(db.prepare('SELECT * FROM exam_attempts WHERE id=?').get(att.id)) });
});
app.post('/api/attempts/:id/pause', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=(SELECT exam_id FROM exam_attempts WHERE id=?)').get(+req.params.id);
  if (!exam || (!exam.pause_enabled || getSetting('pause_enabled', '1') !== '1')) return res.status(403).json({ error: 'الإيقاف المؤقت معطل' });
  let att = db.prepare('SELECT * FROM exam_attempts WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!att) return res.status(404).json({ error: 'غير موجود' });
  att = syncAttempt(att);
  if (att.status !== 'in_progress') return res.status(400).json({ error: 'لا يمكن الإيقاف الآن' });
  let minutes = +(req.body || {}).minutes || 5;
  const maxP = Math.min(exam.max_pause_min, +(getSetting('max_pause_min', '30')) || 30);
  minutes = Math.max(1, Math.min(maxP, minutes));
  const t = now();
  db.prepare('INSERT INTO pause_events(attempt_id,user_id,exam_id,started_at,ends_at,duration_sec) VALUES(?,?,?,?,?,?)')
    .run(att.id, req.user.id, att.exam_id, t, t + minutes * 60 * 1000, minutes * 60);
  db.prepare("UPDATE exam_attempts SET status='paused', paused_until=?, pause_count=pause_count+1 WHERE id=?").run(t + minutes * 60 * 1000, att.id);
  res.json({ ok: true, paused_until: t + minutes * 60 * 1000, minutes });
});
app.post('/api/attempts/:id/resume', requireAuth, (req, res) => {
  let att = db.prepare('SELECT * FROM exam_attempts WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!att) return res.status(404).json({ error: 'غير موجود' });
  if (att.status !== 'paused') return res.json({ ok: true });
  resumeAttempt(att);
  res.json({ ok: true });
});
app.post('/api/attempts/:id/submit', requireAuth, (req, res) => {
  let att = db.prepare('SELECT * FROM exam_attempts WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!att) return res.status(404).json({ error: 'غير موجود' });
  if (att.status === 'submitted') return res.json({ ok: true, attempt: att });
  att = submitAttempt(att);
  res.json({ ok: true, attempt: att });
});
app.get('/api/attempts/:id/result', requireAuth, (req, res) => {
  const att = db.prepare('SELECT a.*, e.title, e.chapter FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.user_id=?').get(+req.params.id, req.user.id);
  if (!att || att.status !== 'submitted') return res.status(400).json({ error: 'النتيجة غير متاحة بعد' });
  const counts = db.prepare(`SELECT
    SUM(CASE WHEN an.selected_choice IS NULL THEN 1 ELSE 0 END) AS unanswered,
    SUM(CASE WHEN an.selected_choice IS NOT NULL AND an.selected_choice != q.correct_choice THEN 1 ELSE 0 END) AS wrong,
    (SELECT COUNT(*) FROM questions WHERE exam_id=a.exam_id) AS total
    FROM exam_attempts a LEFT JOIN questions q ON q.exam_id=a.exam_id LEFT JOIN answers an ON an.attempt_id=a.id AND an.question_id=q.id
    WHERE a.id=?`).get(att.id);
  const pauses = db.prepare('SELECT * FROM pause_events WHERE attempt_id=? ORDER BY started_at').all(att.id);
  res.json({ attempt: att, correct: att.score, wrong: counts.wrong || 0, unanswered: counts.unanswered || 0, total: counts.total, pauses });
});
app.get('/api/attempts/:id/model', requireAuth, (req, res) => {
  const att = db.prepare('SELECT * FROM exam_attempts WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!att || att.status !== 'submitted') return res.status(403).json({ error: 'نموذج الإجابة متاح بعد التسليم فقط' });
  const qs = attemptQuestions(att.id, true);
  const out = qs.map(q => ({
    n: q.n, id: q.id, body: q.body, image_url: q.image_url,
    choices: { A: q.choice_a, B: q.choice_b, C: q.choice_c, D: q.choice_d },
    mine: q.selected, correct: q.correct_choice, explanation: q.explanation,
    state: !q.selected ? 'لم تتم الإجابة' : (q.selected === q.correct_choice ? 'صحيحة' : 'خطأ')
  }));
  res.json(out);
});
app.get('/api/history', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT a.*, e.title, e.chapter FROM exam_attempts a JOIN exams e ON e.id=a.exam_id WHERE a.user_id=? AND a.status='submitted' ORDER BY a.submitted_at DESC`).all(req.user.id);
  res.json(rows);
});
app.get('/api/profile', requireAuth, (req, res) => {
  const atts = db.prepare('SELECT score FROM exam_attempts WHERE user_id=? AND status=?').all(req.user.id, 'submitted');
  const scores = atts.map(a => a.score);
  res.json({
    full_name: req.user.full_name, email: req.user.email, created_at: req.user.created_at,
    count: scores.length, best: scores.length ? Math.max(...scores) : 0,
    avg: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length * 10) / 10 : 0
  });
});
// notifications (student)
app.get('/api/notifications', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT n.id, n.title, n.message, n.type, n.created_at, r.is_read FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id WHERE r.user_id=? ORDER BY n.created_at DESC LIMIT 50`).all(req.user.id);
  res.json(rows);
});
app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notification_recipients SET is_read=1, read_at=? WHERE user_id=?').run(now(), req.user.id);
  res.json({ ok: true });
});
app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notification_recipients SET is_read=1, read_at=? WHERE user_id=? AND notification_id=?').run(now(), req.user.id, +req.params.id);
  res.json({ ok: true });
});

// ---------- admin ----------
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const t = now(), day = t - 86400000;
  const q = (s, ...p) => db.prepare(s).get(...p);
  res.json({
    total_students: q("SELECT COUNT(*) c FROM users WHERE role='student'").c,
    banned_students: q("SELECT COUNT(*) c FROM users WHERE role='student' AND status='banned'").c,
    active_students: q("SELECT COUNT(*) c FROM users WHERE role='student' AND status='active'").c,
    total_exams: q('SELECT COUNT(*) c FROM exams').c,
    total_attempts: q("SELECT COUNT(*) c FROM exam_attempts WHERE status='submitted'").c,
    avg_score: q("SELECT AVG(score) a FROM exam_attempts WHERE status='submitted'").a || 0,
    max_score: q("SELECT MAX(score) m FROM exam_attempts WHERE status='submitted'").m || 0,
    above_50: q("SELECT COUNT(*) c FROM exam_attempts WHERE status='submitted' AND score>=?", +getSetting('leaderboard_threshold', '51')).c,
    today: q('SELECT COUNT(*) c FROM exam_attempts WHERE status=? AND submitted_at>?', 'submitted', day).c,
    dist: db.prepare("SELECT score, COUNT(*) c FROM exam_attempts WHERE status='submitted' GROUP BY score ORDER BY score").all(),
    over_time: db.prepare("SELECT date(submitted_at/1000,'unixepoch') d, COUNT(*) c, AVG(score) avg FROM exam_attempts WHERE status='submitted' GROUP BY d ORDER BY d DESC LIMIT 14").all()
  });
});
app.get('/api/admin/students', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT u.id,u.full_name,u.email,u.status,u.created_at,
    (SELECT COUNT(*) FROM exam_attempts a WHERE a.user_id=u.id AND a.status='submitted') AS exams,
    (SELECT MAX(score) FROM exam_attempts a WHERE a.user_id=u.id AND a.status='submitted') AS best,
    (SELECT AVG(score) FROM exam_attempts a WHERE a.user_id=u.id AND a.status='submitted') AS avg
    FROM users u WHERE u.role='student' ORDER BY u.created_at DESC LIMIT 500`).all();
  res.json(rows);
});
app.get('/api/admin/students/:id', requireAdmin, (req, res) => {
  const u = db.prepare("SELECT id,full_name,email,status,created_at FROM users WHERE id=? AND role='student'").get(+req.params.id);
  if (!u) return res.status(404).json({ error: 'غير موجود' });
  const history = db.prepare("SELECT * FROM exam_attempts WHERE user_id=? AND status='submitted' ORDER BY submitted_at DESC").all(u.id);
  const bans = db.prepare('SELECT * FROM bans WHERE user_id=? ORDER BY id DESC').all(u.id);
  res.json({ student: u, history, bans });
});
app.post('/api/admin/students/:id/ban', requireAdmin, (req, res) => {
  const id = +req.params.id;
  const { reason, days, permanent } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'اكتب سبب الإيقاف' });
  const t = now();
  db.prepare('INSERT INTO bans(user_id,reason,starts_at,ends_at,is_permanent,created_by,active,created_at) VALUES(?,?,?,?,?,?,1,?)')
    .run(id, String(reason), t, permanent ? null : t + ((+days || 7) * 86400000), permanent ? 1 : 0, req.user.id, t);
  db.prepare("UPDATE users SET status='banned' WHERE id=?").run(id);
  audit(req.user.id, 'ban', String(id), String(reason));
  res.json({ ok: true });
});
app.post('/api/admin/students/:id/unban', requireAdmin, (req, res) => {
  const id = +req.params.id;
  db.prepare('UPDATE bans SET active=0 WHERE user_id=? AND active=1').run(id);
  db.prepare("UPDATE users SET status='active' WHERE id=?").run(id);
  audit(req.user.id, 'unban', String(id), '');
  res.json({ ok: true });
});
app.delete('/api/admin/students/:id', requireAdmin, (req, res) => {
  const id = +req.params.id;
  const u = db.prepare('SELECT email FROM users WHERE id=?').get(id);
  db.prepare('DELETE FROM users WHERE id=? AND role=?').run(id, 'student');
  audit(req.user.id, 'delete_student', String(id), u ? u.email : '');
  res.json({ ok: true });
});
app.post('/api/admin/notify', requireAdmin, (req, res) => {
  const { title, message, type, user_ids, all } = req.body || {};
  if (!title || !message) return res.status(400).json({ error: 'العنوان والرسالة مطلوبان' });
  const r = db.prepare('INSERT INTO notifications(title,message,type,created_by,created_at) VALUES(?,?,?,?,?)').run(String(title), String(message), String(type || 'info'), req.user.id, now());
  let targets;
  if (all) targets = db.prepare("SELECT id FROM users WHERE role='student' AND status='active'").all();
  else targets = (user_ids || []).map(id => ({ id: +id })).filter(x => x.id);
  const ins = db.prepare('INSERT OR IGNORE INTO notification_recipients(notification_id,user_id) VALUES(?,?)');
  db.transaction(() => targets.forEach(u => ins.run(r.lastInsertRowid, u.id)))();
  audit(req.user.id, 'notify', all ? 'all' : `${targets.length} users`, String(title));
  res.json({ ok: true, sent: targets.length });
});
// exams CRUD
app.get('/api/admin/exams', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT *, (SELECT COUNT(*) FROM questions WHERE exam_id=exams.id) AS qcount FROM exams ORDER BY id DESC').all();
  res.json(rows);
});
app.post('/api/admin/exams', requireAdmin, (req, res) => {
  const b = req.body || {};
  const r = db.prepare('INSERT INTO exams(title,grade,subject,chapter,duration_min,total_questions,pause_enabled,max_pause_min,is_active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(b.title || 'امتحان', b.grade || 'الصف الثالث الثانوي', b.subject || 'الكيمياء', b.chapter || 'الباب الأول', +b.duration_min || 180, +b.total_questions || 60, b.pause_enabled ? 1 : 0, +b.max_pause_min || 30, b.is_active === false ? 0 : 1, now());
  audit(req.user.id, 'exam_create', String(r.lastInsertRowid), b.title || '');
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.put('/api/admin/exams/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE exams SET title=?,grade=?,subject=?,chapter=?,duration_min=?,pause_enabled=?,max_pause_min=?,is_active=? WHERE id=?')
    .run(b.title, b.grade, b.subject, b.chapter, +b.duration_min || 180, b.pause_enabled ? 1 : 0, +b.max_pause_min || 30, b.is_active === false ? 0 : 1, +req.params.id);
  audit(req.user.id, 'exam_update', req.params.id, '');
  res.json({ ok: true });
});
app.delete('/api/admin/exams/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM exams WHERE id=?').run(+req.params.id);
  audit(req.user.id, 'exam_delete', req.params.id, '');
  res.json({ ok: true });
});
// questions CRUD
app.get('/api/admin/questions', requireAdmin, (req, res) => {
  const examId = +(req.query.exam_id || 0);
  const rows = examId
    ? db.prepare('SELECT * FROM questions WHERE exam_id=? ORDER BY sort_order').all(examId)
    : db.prepare('SELECT * FROM questions ORDER BY exam_id, sort_order LIMIT 300').all();
  res.json(rows);
});
app.post('/api/admin/questions', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.body || !b.choice_a || !b.choice_b || !b.choice_c || !b.choice_d || !['A', 'B', 'C', 'D'].includes(b.correct_choice))
    return res.status(400).json({ error: 'بيانات السؤال ناقصة' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM questions WHERE exam_id=?').get(+b.exam_id || 1)?.m || 0;
  const r = db.prepare('INSERT INTO questions(exam_id,body,image_url,choice_a,choice_b,choice_c,choice_d,correct_choice,explanation,difficulty,chapter,tags,is_sample,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(+b.exam_id || 1, b.body, b.image_url || null, b.choice_a, b.choice_b, b.choice_c, b.choice_d, b.correct_choice, b.explanation || '', b.difficulty || 'medium', b.chapter || 'الباب الأول', b.tags || '', 0, maxOrder + 1);
  audit(req.user.id, 'question_create', String(r.lastInsertRowid), '');
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE questions SET body=?,image_url=?,choice_a=?,choice_b=?,choice_c=?,choice_d=?,correct_choice=?,explanation=?,difficulty=?,chapter=?,tags=? WHERE id=?')
    .run(b.body, b.image_url || null, b.choice_a, b.choice_b, b.choice_c, b.choice_d, b.correct_choice, b.explanation || '', b.difficulty || 'medium', b.chapter || 'الباب الأول', b.tags || '', +req.params.id);
  audit(req.user.id, 'question_update', req.params.id, '');
  res.json({ ok: true });
});
app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM questions WHERE id=?').run(+req.params.id);
  audit(req.user.id, 'question_delete', req.params.id, '');
  res.json({ ok: true });
});
// reports
app.get('/api/admin/reports', requireAdmin, (req, res) => {
  const { q, min, max, from, to } = req.query;
  let sql = `SELECT a.id,a.score,a.total,a.percentage,a.time_used_sec,a.submitted_at,a.pause_count,u.full_name,u.email,e.title,e.chapter
    FROM exam_attempts a JOIN users u ON u.id=a.user_id JOIN exams e ON e.id=a.exam_id WHERE a.status='submitted'`;
  const p = [];
  if (q) { sql += ' AND (u.full_name LIKE ? OR u.email LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  if (min) { sql += ' AND a.score>=?'; p.push(+min); }
  if (max) { sql += ' AND a.score<=?'; p.push(+max); }
  if (from) { sql += ' AND a.submitted_at>=?'; p.push(new Date(from).getTime()); }
  if (to) { sql += ' AND a.submitted_at<=?'; p.push(new Date(to).getTime()); }
  sql += ' ORDER BY a.submitted_at DESC LIMIT 500';
  res.json(db.prepare(sql).all(...p));
});
app.get('/api/admin/reports.csv', requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT u.full_name,u.email,e.title,a.score,a.total,a.percentage,a.time_used_sec,a.submitted_at FROM exam_attempts a JOIN users u ON u.id=a.user_id JOIN exams e ON e.id=a.exam_id WHERE a.status='submitted' ORDER BY a.submitted_at DESC LIMIT 1000`).all();
  const csv = 'name,email,exam,score,total,percentage,time_sec,date\n' + rows.map(r => `"${r.full_name}","${r.email}","${r.title}",${r.score},${r.total},${r.percentage},${r.time_used_sec},"${new Date(r.submitted_at).toISOString()}"`).join('\n');
  res.header('Content-Type', 'text/csv; charset=utf-8').send('\ufeff' + csv);
});
app.get('/api/admin/audit', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all());
});
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT key,value FROM app_settings').all();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const allowed = ['exam_duration_min', 'pause_enabled', 'max_pause_min', 'leaderboard_threshold', 'leaderboard_limit', 'grading', 'registration_enabled', 'maintenance_mode'];
  for (const k of allowed) if (req.body[k] !== undefined) setSetting(k, String(req.body[k]));
  audit(req.user.id, 'settings_update', '', JSON.stringify(req.body).slice(0, 500));
  res.json({ ok: true });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

module.exports = app;
