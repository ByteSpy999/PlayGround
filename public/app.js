/* Chemistry Exam Platform SPA (Arabic RTL) */
const $ = s => document.querySelector(s);
const view = () => $('#view');
let ME = null, PUB = {};
const LETTERS = ['A', 'B', 'C', 'D'];
const AR_L = { A: 'أ', B: 'ب', C: 'ج', D: 'د' };

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || data.message || 'خطأ'); e.data = data; e.status = r.status; throw e; }
  return data;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* background particles (molecules) */
(function bg() {
  const c = $('#bg-canvas'), x = c.getContext('2d');
  let W, H, ps = [];
  function rs() { W = c.width = innerWidth; H = c.height = innerHeight; }
  rs(); addEventListener('resize', rs);
  for (let i = 0; i < 46; i++) ps.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.4, vx: (Math.random() - .5) * .0006, vy: (Math.random() - .5) * .0006, col: Math.random() > .5 ? '56,225,255' : '230,57,70' });
  (function loop() {
    x.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.x = (p.x + p.vx + 1) % 1; p.y = (p.y + p.vy + 1) % 1;
      x.beginPath(); x.arc(p.x * W, p.y * H, p.r, 0, 7);
      x.fillStyle = `rgba(${p.col},.5)`; x.fill();
    }
    requestAnimationFrame(loop);
  })();
})();

async function boot() {
  try { PUB = await api('/api/settings-public'); } catch {}
  try { const m = await api('/api/me'); ME = m.user; } catch { ME = null; }
  renderNav();
  addEventListener('hashchange', route);
  route();
}
function renderNav() {
  const n = $('#nav'); n.innerHTML = '';
  const link = (h, t, cls = '') => `<a class="btn small ${cls}" href="${h}">${t}</a>`;
  if (!ME) n.innerHTML = link('#/', 'الرئيسية', 'ghost') + link('#/leaderboard', 'الأوائل') + link('#/login', 'دخول') + link('#/register', 'حساب جديد', 'primary');
  else {
    n.innerHTML = link('#/dashboard', 'لوحتي') + link('#/leaderboard', 'الأوائل') + link('#/notifications', `🔔 الإشعارات`) +
      (ME.role === 'admin' ? link('#/admin', 'الأدمن', 'cyan') : '') +
      `<button class="btn small ghost" onclick="logout()">خروج</button>`;
  }
  $('#brand').onclick = () => location.hash = ME ? '#/dashboard' : '#/';
}
async function logout() { await api('/api/logout', { method: 'POST' }).catch(() => {}); ME = null; location.hash = '#/'; renderNav(); }

function route() {
  const h = location.hash || '#/';
  window.scrollTo(0, 0);
  if (h.startsWith('#/exam')) return ExamView();
  if (h.startsWith('#/result/')) return ResultView(h.split('/')[2]);
  if (h.startsWith('#/model/')) return ModelView(h.split('/')[2]);
  if (h === '#/login') return LoginView();
  if (h === '#/register') return RegisterView();
  if (h === '#/dashboard') return DashView();
  if (h === '#/history') return HistoryView();
  if (h === '#/profile') return ProfileView();
  if (h === '#/leaderboard') return LeadView();
  if (h === '#/notifications') return NotifView();
  if (h.startsWith('#/admin')) return AdminView(h);
  return HomeView();
}
const need = () => { if (!ME) { location.hash = '#/login'; return true; } };

/* ---------- HOME ---------- */
async function HomeView() {
  let lead = [];
  try { lead = (await api('/api/leaderboard')).rows || []; } catch {}
  view().innerHTML = `
  <section class="hero">
    <span class="badge">⚗️ كيمياء • الصف الثالث الثانوي • الباب الأول</span>
    <h1>منصتك الذكية لاختبار الكيمياء</h1>
    <p>اختبر مستواك في كيمياء الصف الثالث الثانوي — 60 سؤالًا في 3 ساعات مع تصحيح فوري</p>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
      ${ME ? `<a class="btn primary" href="#/dashboard">لوحة التحكم</a>` : `<a class="btn primary" href="#/register">إنشاء حساب</a><a class="btn" href="#/login">تسجيل الدخول</a>`}
    </div>
  </section>
  <div class="grid c3">
    <div class="card"><h3>📝 كيف يعمل الامتحان؟</h3><p class="mut">60 سؤال اختيار من متعدد • تنقل حر • تعليم للمراجعة • إيقاف طارئ • تسليم تلقائي عند انتهاء الوقت.</p></div>
    <div class="card"><h3>📊 نظام الدرجات</h3><p class="mut">الدرجة من 60 • ممتاز 90%+ • جيد جدًا 75%+ • الأوائل لمن يتجاوز 50 درجة.</p></div>
    <div class="card"><h3>⚗️ مميزات المنصة</h3><p class="mut">مؤقت دقيق • نموذج إجابة • تقارير • إشعارات • ترتيب • يعمل على الموبايل.</p></div>
  </div>
  <div class="card" style="margin-top:12px"><h3>🏆 أوائل الطلاب</h3>
    ${lead.slice(0, 5).map((r, i) => `<div class="lead-row"><span class="medal">${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]}</span><b>${esc(r.name)}</b><span class="mut" style="margin-right:auto">${r.score} / ${r.total} • ${r.percentage}%</span></div>`).join('') || '<p class="mut">لا توجد نتائج بعد — كن أول الأوائل!</p>'}
    <a class="btn small" href="#/leaderboard" style="margin-top:8px">عرض الكل</a></div>`;
}

/* ---------- AUTH ---------- */
function LoginView() {
  view().innerHTML = `<form class="card form" onsubmit="return doLogin(event)">
    <h2 style="text-align:center">🔬 تسجيل الدخول</h2><div id="msg"></div>
    <div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" required></div>
    <div class="field"><label>كلمة المرور</label><input name="password" type="password" required></div>
    <button class="btn primary" style="width:100%">تسجيل الدخول</button>
    <p style="text-align:center"><a href="#/register" style="color:var(--cyan)">إنشاء حساب جديد</a></p>
    <hr style="border-color:var(--line)"><p style="text-align:center"><a href="#" onclick="return adminLogin(event)" class="mut">دخول الأدمن</a></p></form>`;
}
async function doLogin(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
    ME = r.user; renderNav(); location.hash = r.user.role === 'admin' ? '#/admin' : '#/dashboard';
  } catch (err) {
    const d = err.data || {};
    $('#msg').innerHTML = `<div class="err">${esc(d.error === 'banned' ? d.message : (d.error || 'خطأ'))}</div>`;
  }
  return false;
}
async function adminLogin(e) {
  e.preventDefault();
  view().innerHTML = `<form class="card form" onsubmit="return doLogin(event)">
    <h2 style="text-align:center">🛡️ دخول الإدارة</h2>
    <p class="mut" style="text-align:center">منطقة مقيدة — يتم تسجيل كل محاولات الدخول</p><div id="msg"></div>
    <div class="field"><label>بريد الأدمن</label><input name="email" type="email" required autocomplete="username"></div>
    <div class="field"><label>كلمة المرور</label><input name="password" type="password" required autocomplete="current-password"></div>
    <button class="btn primary" style="width:100%">دخول آمن</button>
    <p style="text-align:center"><a href="#/login" class="mut">عودة لدخول الطلاب</a></p></form>`;
  return false;
}
async function RegisterView() {
  let terms = '';
  try { terms = (await api('/api/terms')).body || ''; } catch {}
  view().innerHTML = `<form class="card form" onsubmit="return doRegister(event)">
    <h2 style="text-align:center">🧪 إنشاء حساب طالب</h2><div id="msg"></div>
    <div class="field"><label>الاسم الثلاثي</label><input name="full_name" required placeholder="مثال: أحمد محمد علي"></div>
    <div class="field"><label>البريد الإلكتروني</label><input name="email" type="email" required></div>
    <div class="field"><label>كلمة المرور (8+ حروف وأرقام)</label><input name="password" type="password" required minlength="8"></div>
    <div class="field"><label>تأكيد كلمة المرور</label><input name="confirm" type="password" required></div>
    <label style="font-weight:700;font-size:14px">شروط استخدام المنصة (اقرأ للنهاية)</label>
    <div class="terms" id="termsBox">${esc(terms)}</div>
    <label class="check"><input type="checkbox" id="acc"><span>أوافق على شروط استخدام المنصة</span></label>
    <button class="btn primary" id="regBtn" style="width:100%" disabled>إنشاء الحساب</button>
    <p style="text-align:center"><a href="#/login" style="color:var(--cyan)">لديك حساب؟ سجل الدخول</a></p></form>`;
  const box = $('#termsBox'), acc = $('#acc'), btn = $('#regBtn');
  box.onscroll = () => { if (box.scrollTop + box.clientHeight >= box.scrollHeight - 8) acc.focus(); };
  acc.onchange = () => {
    const read = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    if (acc.checked && !read) { acc.checked = false; alert('يرجى قراءة الشروط حتى النهاية أولًا'); return; }
    btn.disabled = !acc.checked;
  };
}
async function doRegister(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const r = await api('/api/register', { method: 'POST', body: JSON.stringify({ full_name: f.get('full_name'), email: f.get('email'), password: f.get('password'), confirm: f.get('confirm'), accept_terms: $('#acc').checked }) });
    ME = r.user; renderNav(); location.hash = '#/dashboard';
  } catch (err) { $('#msg').innerHTML = `<div class="err">${esc((err.data || {}).error || 'خطأ')}</div>`; }
  return false;
}

/* ---------- DASHBOARD ---------- */
async function DashView() {
  if (need()) return;
  const d = await api('/api/dashboard');
  const last = d.last;
  view().innerHTML = `
  <div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
    <span style="font-size:34px">🧑‍🔬</span>
    <div><b>${esc(ME.full_name)}</b><br><span class="mut">${esc(ME.email)}</span></div>
    <span style="margin-right:auto" class="badge">الحساب: نشط ✅</span>
  </div>
  <div class="grid c3">
    <div class="card"><div class="mut">🧪 امتحان الكيمياء</div><div class="big">الباب الأول</div><div class="mut">60 سؤال • 3 ساعات</div></div>
    <div class="card"><div class="mut">⭐ آخر نتيجة</div><div class="big cyan">${last ? last.score + ' / ' + last.total : '—'}</div><div class="mut">${last ? last.percentage + '% • ' + esc(last.grade_label || '') : 'لم تبدأ بعد'}</div></div>
    <div class="card"><div class="mut">🏅 الترتيب</div><div class="big">${d.rank || '—'}</div><div class="mut">محاولاتك: ${d.attempts} • متوسطك: ${d.avg}</div></div>
  </div>
  <div class="card" style="margin-top:12px;text-align:center">
    <h3>⚗️ ${esc((d.exam || {}).title || 'امتحان الكيمياء')}</h3>
    <p class="mut">60 سؤال • مدة الامتحان: 3 ساعات ${d.ongoing_attempt_id ? '• <b class="amber">لديك محاولة جارية — أكمل من حيث توقفت</b>' : ''}</p>
    <button class="btn primary" onclick="startExam(${(d.exam || {}).id || 1})" style="font-size:18px;padding:14px 40px">${d.ongoing_attempt_id ? 'استكمال الامتحان ▶' : 'ابدأ امتحان الكيمياء 🚀'}</button>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap">
      <a class="btn small" href="#/history">سجل المحاولات</a><a class="btn small" href="#/profile">الملف الشخصي</a><a class="btn small" href="#/leaderboard">الأوائل</a><a class="btn small" href="#/notifications">الإشعارات (${d.unread})</a>
    </div></div>`;
}
async function startExam(examId) {
  try {
    const r = await api('/api/attempts/start', { method: 'POST', body: JSON.stringify({ exam_id: examId }) });
    location.hash = '#/exam?id=' + r.attempt_id;
  } catch (e) { alert((e.data || {}).error || 'تعذر بدء الامتحان'); }
}

/* ---------- EXAM ---------- */
let EX = null, exTimer = null, exSync = null;
async function ExamView() {
  if (need()) return;
  const id = +(location.hash.split('id=')[1] || 0);
  if (!id) { location.hash = '#/dashboard'; return; }
  clearInterval(exTimer); clearInterval(exSync);
  try {
    const data = await api('/api/attempts/' + id);
    if (data.submitted) { location.hash = '#/result/' + id; return; }
    EX = { id, ...data, idx: 0 };
    renderExam();
    exTimer = setInterval(tickLocal, 1000);
    exSync = setInterval(syncServer, 15000);
  } catch (e) { alert('تعذر تحميل الامتحان'); location.hash = '#/dashboard'; }
}
function fmt(s) { s = Math.max(0, s | 0); const h = String((s / 3600) | 0).padStart(2, '0'), m = String(((s % 3600) / 60) | 0).padStart(2, '0'), ss = String(s % 60).padStart(2, '0'); return `${h}:${m}:${ss}`; }
function counts() {
  const a = EX.questions.filter(q => q.selected).length;
  const m = EX.questions.filter(q => q.marked).length;
  return { a, u: EX.questions.length - a, m };
}
function renderExam() {
  const q = EX.questions[EX.idx], c = counts();
  const rem = EX.attempt.remaining_sec;
  view().innerHTML = `
  <div class="card" style="position:sticky;top:70px;z-index:4">
    <div class="exam-bar">
      <div><b>السؤال ${EX.idx + 1} من ${EX.questions.length}</b><br><span class="mut">أجبت: ${c.a} • متبقٍ: ${c.u} • للمراجعة: ${c.m}</span></div>
      <div class="timer ${rem < 600 ? 'danger' : ''}" id="timer">${fmt(rem)}</div>
      <div style="display:flex;gap:8px">
        ${EX.exam.pause_enabled ? `<button class="btn small" onclick="pauseModal()">⏸ عندي ظرف</button>` : ''}
        <button class="btn small primary" onclick="submitModal()">إنهاء الامتحان</button>
      </div>
    </div>
    <div class="palette">${EX.questions.map((x, i) => `<button class="pal ${i === EX.idx ? 'cur' : ''} ${x.selected ? 'ans' : ''} ${x.marked ? 'mark' : ''}" onclick="gotoQ(${i})">${i + 1}</button>`).join('')}</div>
  </div>
  <div class="card q-card">
    <h3>السؤال ${EX.idx + 1}</h3>
    ${q.image_url ? `<img class="q-img" src="${q.image_url}" alt="شكل توضيحي">` : ''}
    <p style="font-size:17px;line-height:2">${esc(q.body)}</p>
    ${LETTERS.map(L => `<button class="choice ${q.selected === L ? 'sel' : ''}" onclick="answer('${L}')"><span class="k">${AR_L[L]}</span><span>${esc(q['choice_' + L.toLowerCase()])}</span></button>`).join('')}
    <div class="exam-bar">
      <button class="btn" onclick="navQ(-1)" ${EX.idx === 0 ? 'disabled' : ''}>السابق ←</button>
      <button class="btn ${q.marked ? 'cyan' : ''}" onclick="toggleMark()">${q.marked ? '🔖 إلغاء التعليم' : '🏷 تعليم للمراجعة'}</button>
      <button class="btn" onclick="navQ(1)" ${EX.idx === EX.questions.length - 1 ? 'disabled' : ''}>التالي →</button>
    </div>
  </div>
  ${EX.attempt.status === 'paused' ? `<div class="pause-overlay"><div><h2>⏸ الامتحان متوقف مؤقتًا</h2><p class="mut">الاستئناف خلال:</p><div class="timer" id="pauseTimer"></div><br><button class="btn cyan" onclick="resumeEx()">استئناف الآن ▶</button></div></div>` : ''}
  <div id="modal"></div>`;
  if (EX.attempt.status === 'paused') {
    const pt = setInterval(() => {
      const el = $('#pauseTimer');
      if (!el || EX.attempt.status !== 'paused') { clearInterval(pt); return; }
      const s = Math.max(0, Math.floor((EX.attempt.paused_until - Date.now()) / 1000));
      el.textContent = fmt(s);
      if (s <= 0) { clearInterval(pt); syncServer(); }
    }, 500);
  }
}
function tickLocal() {
  if (!EX || EX.attempt.status !== 'in_progress') return;
  EX.attempt.remaining_sec--;
  const el = $('#timer');
  if (el) { el.textContent = fmt(EX.attempt.remaining_sec); if (EX.attempt.remaining_sec < 600) el.classList.add('danger'); }
  if (EX.attempt.remaining_sec <= 0) syncServer();
}
async function syncServer() {
  if (!EX) return;
  try {
    const data = await api('/api/attempts/' + EX.id);
    if (data.submitted || data.attempt.status === 'submitted') { clearInterval(exTimer); clearInterval(exSync); location.hash = '#/result/' + EX.id; return; }
    const sel = new Map(EX.questions.map(q => [q.id, { selected: q.selected, marked: q.marked }]));
    EX = { id: EX.id, ...data, idx: Math.min(EX.idx, data.questions.length - 1) };
    EX.questions.forEach(q => { const s = sel.get(q.id); if (s && !q.selected) { q.selected = s.selected; q.marked = s.marked; } });
    renderExam();
  } catch {}
}
function gotoQ(i) { EX.idx = i; renderExam(); }
function navQ(d) { EX.idx = Math.max(0, Math.min(EX.questions.length - 1, EX.idx + d)); renderExam(); }
async function answer(L) {
  const q = EX.questions[EX.idx];
  q.selected = (q.selected === L) ? null : L;
  renderExam();
  try { await api(`/api/attempts/${EX.id}/answer`, { method: 'PUT', body: JSON.stringify({ question_id: q.id, selected: EX.questions[EX.idx].selected }) }); }
  catch (e) { if ((e.data || {}).error === 'تم تسليم الامتحان') syncServer(); }
}
async function toggleMark() {
  const q = EX.questions[EX.idx];
  q.marked = !q.marked; renderExam();
  await api(`/api/attempts/${EX.id}/answer`, { method: 'PUT', body: JSON.stringify({ question_id: q.id, marked: q.marked }) }).catch(() => {});
}
function pauseModal() {
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal">
    <h3>⏸ هل تريد إيقاف الامتحان مؤقتًا؟</h3><p class="mut">اختر مدة الإيقاف (المؤقت الرئيسي يتوقف)</p>
    <div class="grid c2">${[5, 10, 15, 30].map(m => `<button class="btn" onclick="doPause(${m})">${m === 30 ? '30 دقيقة' : m + ' دقائق'}</button>`).join('')}</div>
    <div class="field" style="margin-top:10px"><label>أو حدد مدة مخصصة (دقائق)</label><input id="customMin" type="number" min="1" max="60" value="5"></div>
    <div class="row"><button class="btn ghost" onclick="$('#modal').innerHTML=''">إلغاء</button><button class="btn cyan" onclick="doPause(+$('#customMin').value)">تأكيد الإيقاف</button></div>
  </div></div>`;
}
async function doPause(min) {
  try {
    await api(`/api/attempts/${EX.id}/pause`, { method: 'POST', body: JSON.stringify({ minutes: min }) });
    await syncServer();
  } catch (e) { alert((e.data || {}).error || 'تعذر الإيقاف'); }
}
async function resumeEx() { await api(`/api/attempts/${EX.id}/resume`, { method: 'POST' }).catch(() => {}); syncServer(); }
function submitModal() {
  const c = counts();
  $('#modal').innerHTML = `<div class="modal-bg"><div class="modal">
    <h3>هل أنت متأكد أنك تريد إنهاء الامتحان؟</h3>
    <p>✅ أجبت: <b class="green">${c.a}</b> • ❌ لم تجب: <b class="red">${c.u}</b> • 🔖 للمراجعة: <b class="amber">${c.m}</b></p>
    <div class="row"><button class="btn ghost" onclick="$('#modal').innerHTML=''">العودة للامتحان</button><button class="btn primary" onclick="doSubmit()">إنهاء الامتحان</button></div>
  </div></div>`;
}
async function doSubmit() {
  try {
    await api(`/api/attempts/${EX.id}/submit`, { method: 'POST' });
    clearInterval(exTimer); clearInterval(exSync);
    location.hash = '#/result/' + EX.id;
  } catch (e) { alert('تعذر التسليم'); }
}

/* ---------- RESULT / MODEL / HISTORY / PROFILE ---------- */
async function ResultView(id) {
  if (need()) return;
  const r = await api(`/api/attempts/${id}/result`);
  const a = r.attempt, pct = a.percentage;
  view().innerHTML = `<div class="card" style="text-align:center">
    <h2>📊 نتيجة الامتحان</h2>
    <p class="mut">${esc(a.full_name || ME.full_name)} • ${esc(a.title)} • ${esc(a.chapter)} • ${new Date(a.submitted_at).toLocaleString('ar-EG')}</p>
    <div class="score-ring" style="--p:${pct}%"><b>${a.score} / ${a.total}</b><span>${pct}% • ${esc(a.grade_label || '')}</span></div>
    <div class="grid c3" style="margin-top:14px">
      <div class="card"><div class="mut">✅ صحيحة</div><div class="big green">${r.correct}</div></div>
      <div class="card"><div class="mut">❌ خاطئة</div><div class="big red">${r.wrong}</div></div>
      <div class="card"><div class="mut">⚪ لم تُجب</div><div class="big">${r.unanswered}</div></div>
    </div>
    <p class="mut">⏱ المدة المستخدمة: ${Math.floor(a.time_used_sec / 60)} دقيقة • ⏸ مرات الإيقاف: ${a.pause_count}</p>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <a class="btn primary" href="#/model/${id}">مشاهدة نموذج الإجابة</a>
      <a class="btn" href="#/history">مشاهدة التقرير</a>
      <a class="btn ghost" href="#/dashboard">العودة للوحة التحكم</a>
    </div></div>`;
}
async function ModelView(id) {
  if (need()) return;
  try {
    const rows = await api(`/api/attempts/${id}/model`);
    view().innerHTML = `<h2>📖 نموذج الإجابة</h2>` + rows.map(q => `
    <div class="card" style="margin-bottom:10px">
      <b>السؤال ${q.n}</b> — <span class="${q.state === 'صحيحة' ? 'green' : q.state === 'خطأ' ? 'red' : 'amber'}">الحالة: ${q.state}</span>
      ${q.image_url ? `<img class="q-img" src="${q.image_url}">` : ''}
      <p>${esc(q.body)}</p>
      ${['A', 'B', 'C', 'D'].map(L => `<div class="choice ${L === q.correct ? 'right' : ''} ${L === q.mine && L !== q.correct ? 'wrong' : ''}"><span class="k">${AR_L[L]}</span><span>${esc(q.choices[L])}</span></div>`).join('')}
      <p class="mut">إجابتك: <b>${q.mine ? AR_L[q.mine] : '—'}</b> • الإجابة الصحيحة: <b class="green">${AR_L[q.correct]}</b></p>
      ${q.explanation ? `<p class="mut">💡 ${esc(q.explanation)}</p>` : ''}
    </div>`).join('') + `<a class="btn" href="#/result/${id}">عودة للنتيجة</a>`;
  } catch { view().innerHTML = `<div class="err">نموذج الإجابة متاح بعد تسليم الامتحان فقط</div>`; }
}
async function HistoryView() {
  if (need()) return;
  const rows = await api('/api/history');
  view().innerHTML = `<h2>📚 سجل الامتحانات</h2>${rows.map(a => `
    <div class="card" style="margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div><b>${esc(a.title)}</b> • ${esc(a.chapter)}<br><span class="mut">${new Date(a.submitted_at).toLocaleString('ar-EG')} • ⏱ ${Math.floor(a.time_used_sec / 60)} د • ⏸ ${a.pause_count}</span></div>
      <span style="margin-right:auto" class="badge">${a.score}/${a.total} • ${a.percentage}%</span>
      <a class="btn small" href="#/result/${a.id}">التقرير</a><a class="btn small ghost" href="#/model/${a.id}">النموذج</a>
    </div>`).join('') || '<div class="card mut">لا توجد محاولات بعد</div>'}`;
}
async function ProfileView() {
  if (need()) return;
  const p = await api('/api/profile');
  view().innerHTML = `<div class="card form" style="max-width:560px">
    <h2 style="text-align:center">👤 الملف الشخصي</h2>
    <p><b>الاسم الثلاثي:</b> ${esc(p.full_name)}</p><p><b>البريد:</b> ${esc(p.email)}</p>
    <p><b>تاريخ التسجيل:</b> ${new Date(p.created_at).toLocaleDateString('ar-EG')}</p>
    <p><b>عدد الامتحانات:</b> ${p.count} • <b>أعلى درجة:</b> ${p.best} • <b>المتوسط:</b> ${p.avg}</p>
    <a class="btn" href="#/dashboard">عودة</a></div>`;
}
async function LeadView() {
  let d = { rows: [], threshold: 51, rule: '' };
  try { d = await api('/api/leaderboard'); } catch {}
  const medals = ['🥇', '🥈', '🥉'];
  view().innerHTML = `<h2>🏆 أوائل الطلاب</h2><p class="mut">يشترط أكثر من 50/60 • ${esc(d.rule || '')}</p>
  ${d.rows.map((r, i) => `<div class="lead-row"><span class="medal">${medals[i] || (i + 1)}</span><b>${esc(r.name)}</b><span class="mut" style="margin-right:auto">${r.score}/${r.total} • ${r.percentage}% • ${new Date(r.submitted_at).toLocaleDateString('ar-EG')}</span></div>`).join('') || '<div class="card mut">لا يوجد أوائل بعد</div>'}`;
}
async function NotifView() {
  if (need()) return;
  const rows = await api('/api/notifications');
  view().innerHTML = `<div style="display:flex;align-items:center;gap:10px"><h2>🔔 الإشعارات</h2><button class="btn small" style="margin-right:auto" onclick="readAll()">تحديد الكل كمقروء</button></div>
  ${rows.map(n => `<div class="card" style="margin-bottom:8px;${n.is_read ? 'opacity:.65' : 'border-color:var(--cyan)'}"><b>${esc(n.title)}</b> <span class="mut">• ${new Date(n.created_at).toLocaleString('ar-EG')}</span><p>${esc(n.message)}</p>${n.is_read ? '' : `<button class="btn small" onclick="readOne(${n.id})">تعيين كمقروء</button>`}</div>`).join('') || '<div class="card mut">لا توجد إشعارات</div>'}`;
}
async function readAll() { await api('/api/notifications/read-all', { method: 'POST' }); NotifView(); }
async function readOne(id) { await api(`/api/notifications/${id}/read`, { method: 'POST' }); NotifView(); }

/* ---------- ADMIN ---------- */
async function AdminView(h) {
  if (!ME) { location.hash = '#/login'; return; }
  if (ME.role !== 'admin') { view().innerHTML = '<div class="err">غير مصرح — منطقة الإدارة فقط</div>'; return; }
  const tab = (h.split('/')[2] || 'home');
  const T = (k, t) => `<a class="btn small ${tab === k ? 'active' : ''}" href="#/admin/${k}">${t}</a>`;
  let body = '<div class="card mut">جاري التحميل...</div>';
  view().innerHTML = `<h2>🛡️ لوحة الإدارة</h2><div class="tabs">${T('home', '📊 الرئيسية')}${T('students', '👥 الطلاب')}${T('exams', '📝 الامتحانات')}${T('questions', '❓ الأسئلة')}${T('reports', '📈 التقارير')}${T('notify', '📢 إشعار')}${T('settings', '⚙️ الإعدادات')}${T('audit', '🧾 السجل')}</div><div id="abody">${body}</div>`;
  const B = $('#abody');
  try {
    if (tab === 'home') {
      const s = await api('/api/admin/stats');
      B.innerHTML = `<div class="grid c3">
        <div class="card"><div class="mut">إجمالي الطلاب</div><div class="admin-kpi">${s.total_students}</div></div>
        <div class="card"><div class="mut">النشطون / المحظورون</div><div class="admin-kpi">${s.active_students} / <span class="red">${s.banned_students}</span></div></div>
        <div class="card"><div class="mut">المحاولات / أنهوا اليوم</div><div class="admin-kpi">${s.total_attempts} / ${s.today}</div></div>
        <div class="card"><div class="mut">متوسط الدرجات</div><div class="admin-kpi cyan">${(+s.avg_score).toFixed(1)}</div></div>
        <div class="card"><div class="mut">أعلى درجة</div><div class="admin-kpi green">${s.max_score}</div></div>
        <div class="card"><div class="mut">فوق 50</div><div class="admin-kpi amber">${s.above_50}</div></div></div>
        <div class="card" style="margin-top:12px"><h3>توزيع الدرجات</h3><div style="display:flex;align-items:flex-end;gap:4px;height:120px;direction:ltr">${s.dist.map(d => `<div title="${d.score}: ${d.c}" style="flex:1;background:linear-gradient(180deg,var(--cyan),var(--blue));border-radius:4px 4px 0 0;height:${Math.max(4, d.c / Math.max(...s.dist.map(x => x.c), 1) * 110)}px"></div>`).join('')}</div></div>`;
    } else if (tab === 'students') {
      const rows = await api('/api/admin/students');
      B.innerHTML = `<div class="tbl-wrap card"><table class="tbl"><tr><th>الاسم</th><th>البريد</th><th>الحالة</th><th>امتحانات</th><th>أعلى</th><th>متوسط</th><th>إجراءات</th></tr>
      ${rows.map(u => `<tr><td>${esc(u.full_name)}</td><td class="mut">${esc(u.email)}</td><td>${u.status === 'banned' ? '<b class="red">محظور</b>' : '<span class="green">نشط</span>'}</td><td>${u.exams || 0}</td><td>${u.best ?? '—'}</td><td>${u.avg ? (+u.avg).toFixed(1) : '—'}</td>
      <td style="white-space:nowrap"><button class="btn small" onclick="admStudent(${u.id})">عرض</button> ${u.status === 'banned' ? `<button class="btn small cyan" onclick="unban(${u.id})">فك</button>` : `<button class="btn small" onclick="ban(${u.id})">حظر</button>`} <button class="btn small" onclick="notifyOne(${u.id})">📢</button> <button class="btn small danger" onclick="delStu(${u.id})">حذف</button></td></tr>`).join('')}</table></div><div id="sdet"></div>`;
    } else if (tab === 'exams') {
      const rows = await api('/api/admin/exams');
      B.innerHTML = rows.map(e => `<div class="card" style="margin-bottom:8px"><b>${esc(e.title)}</b> • ${esc(e.chapter)} • ${e.qcount} سؤال • ${e.duration_min} د • ${e.is_active ? '<span class="green">نشط</span>' : '<span class="red">معطل</span>'} • إيقاف: ${e.pause_enabled ? 'مفعّل' : 'معطل'}
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" onclick="toggleExam(${e.id},${e.is_active ? 0 : 1})">${e.is_active ? 'تعطيل' : 'تفعيل'}</button><button class="btn small danger" onclick="delExam(${e.id})">حذف</button></div></div>`).join('') +
      `<form class="card" onsubmit="return addExam(event)"><h3>➕ امتحان جديد</h3><div class="grid c2"><div class="field"><label>العنوان</label><input name="title" required></div><div class="field"><label>الباب</label><input name="chapter" value="الباب الأول"></div><div class="field"><label>المدة (دقيقة)</label><input name="duration_min" type="number" value="180"></div><div class="field"><label>أقصى إيقاف (دقيقة)</label><input name="max_pause_min" type="number" value="30"></div></div><label class="check"><input type="checkbox" name="pause_enabled" checked> تفعيل الإيقاف المؤقت</label><button class="btn primary">حفظ</button></form>`;
    } else if (tab === 'questions') {
      const exams = await api('/api/admin/exams');
      const exId = exams[0]?.id || 1;
      const qs = await api('/api/admin/questions?exam_id=' + exId);
      B.innerHTML = `<p class="mut">الامتحان: ${esc(exams[0]?.title || '')} — ${qs.length} سؤال (الصحيح لا يظهر للطلاب قبل التسليم)</p>` +
        qs.map((q, i) => `<div class="card" style="margin-bottom:8px"><b>${i + 1}. ${esc(q.body.slice(0, 120))}</b><br><span class="mut">A:${esc(q.choice_a.slice(0, 40))} • ... • الصحيح: <b class="green">${q.correct_choice}</b> • ${esc(q.difficulty)}</span>
        <div style="margin-top:6px;display:flex;gap:6px"><button class="btn small" onclick="editQ(${q.id})">تعديل</button><button class="btn small danger" onclick="delQ(${q.id})">حذف</button></div></div>`).join('') +
        `<form class="card" onsubmit="return addQ(event,${exId})"><h3>➕ سؤال جديد</h3><div class="field"><label>نص السؤال</label><textarea name="body" required></textarea></div><div class="field"><label>رابط صورة (اختياري)</label><input name="image_url"></div><div class="grid c2">${['a', 'b', 'c', 'd'].map(L => `<div class="field"><label>الاختيار ${L.toUpperCase()}</label><input name="choice_${L}" required></div>`).join('')}</div><div class="grid c2"><div class="field"><label>الإجابة الصحيحة</label><select name="correct_choice"><option>A</option><option>B</option><option>C</option><option>D</option></select></div><div class="field"><label>الشرح</label><input name="explanation"></div></div><button class="btn primary">إضافة (معاينة: تُحفظ كمسودة قابلة للتعديل)</button></form>`;
    } else if (tab === 'reports') {
      const rows = await api('/api/admin/reports');
      B.innerHTML = `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap"><input id="rq" class="btn ghost" placeholder="بحث باسم/بريد" style="text-align:right"><button class="btn small" onclick="admReports()">بحث</button><a class="btn small cyan" href="/api/admin/reports.csv">⬇ CSV</a></div><div class="tbl-wrap card"><table class="tbl"><tr><th>الطالب</th><th>الدرجة</th><th>%</th><th>الوقت</th><th>التاريخ</th></tr>
      ${rows.map(r => `<tr><td>${esc(r.full_name)}<br><span class="mut">${esc(r.email)}</span></td><td><b>${r.score}/${r.total}</b></td><td>${r.percentage}%</td><td>${Math.floor(r.time_used_sec / 60)} د</td><td class="mut">${new Date(r.submitted_at).toLocaleString('ar-EG')}</td></tr>`).join('')}</table></div>`;
    } else if (tab === 'notify') {
      const rows = await api('/api/admin/students');
      B.innerHTML = `<form class="card" onsubmit="return sendNotif(event)"><h3>📢 إرسال إشعار</h3>
      <div class="field"><label>العنوان</label><input name="title" required></div><div class="field"><label>الرسالة</label><textarea name="message" required></textarea></div>
      <label class="check"><input type="checkbox" name="all" checked onchange="document.querySelector('#ulist').style.display=this.checked?'none':''"> إرسال للجميع</label>
      <div id="ulist" style="display:none" class="tbl-wrap"><table class="tbl">${rows.map(u => `<tr><td><label><input type="checkbox" name="uid" value="${u.id}"> ${esc(u.full_name)}</label></td></tr>`).join('')}</table></div>
      <button class="btn primary">إرسال</button></form>`;
    } else if (tab === 'settings') {
      const s = await api('/api/admin/settings');
      B.innerHTML = `<form class="card" onsubmit="return saveSettings(event)"><h3>⚙️ الإعدادات</h3>
      ${[['exam_duration_min', 'مدة الامتحان (دقيقة)'], ['max_pause_min', 'أقصى إيقاف (دقيقة)'], ['leaderboard_threshold', 'عتبة الأوائل'], ['leaderboard_limit', 'عدد الأوائل']].map(([k, l]) => `<div class="field"><label>${l}</label><input name="${k}" value="${esc(s[k] ?? '')}"></div>`).join('')}
      ${[['pause_enabled', 'تفعيل الإيقاف'], ['registration_enabled', 'تفعيل التسجيل'], ['maintenance_mode', 'وضع الصيانة']].map(([k, l]) => `<label class="check"><input type="checkbox" name="${k}" ${s[k] === '1' ? 'checked' : ''}> ${l}</label>`).join('')}
      <button class="btn primary">حفظ الإعدادات</button></form>`;
    } else if (tab === 'audit') {
      const rows = await api('/api/admin/audit');
      B.innerHTML = `<div class="tbl-wrap card"><table class="tbl"><tr><th>الوقت</th><th>الإجراء</th><th>الهدف</th><th>تفاصيل</th></tr>${rows.map(a => `<tr><td class="mut">${new Date(a.created_at).toLocaleString('ar-EG')}</td><td><b>${esc(a.action)}</b></td><td>${esc(a.target)}</td><td class="mut">${esc((a.meta || '').slice(0, 80))}</td></tr>`).join('')}</table></div>`;
    }
  } catch (e) { B.innerHTML = '<div class="err">تعذر التحميل</div>'; }
}
async function admStudent(id) {
  const d = await api('/api/admin/students/' + id);
  $('#sdet').innerHTML = `<div class="card" style="margin-top:10px"><h3>${esc(d.student.full_name)} — ${esc(d.student.email)}</h3>
  <p class="mut">مسجل: ${new Date(d.student.created_at).toLocaleDateString('ar-EG')} • الحالة: ${d.student.status}</p>
  ${d.history.map(h => `<div>📝 ${h.score}/${h.total} (${h.percentage}%) — ${new Date(h.submitted_at).toLocaleString('ar-EG')}</div>`).join('') || '<p class="mut">لا محاولات</p>'}
  ${d.bans.map(b => `<div class="red">⛔ ${esc(b.reason)} — ${new Date(b.starts_at).toLocaleDateString('ar-EG')}</div>`).join('')}</div>`;
  $('#sdet').scrollIntoView();
}
async function ban(id) { const r = prompt('سبب الحظر:'); if (!r) return; const p = confirm('حظر دائم؟ (إلغاء = مؤقت 7 أيام)'); await api(`/api/admin/students/${id}/ban`, { method: 'POST', body: JSON.stringify({ reason: r, permanent: p, days: 7 }) }); AdminView('#/admin/students'); }
async function unban(id) { if (!confirm('فك الحظر عن هذا الطالب؟')) return; await api(`/api/admin/students/${id}/unban`, { method: 'POST' }); AdminView('#/admin/students'); }
async function delStu(id) { if (!confirm('هل أنت متأكد من حذف هذا الحساب؟ سيُحذف نهائيًا مع نتائجه!')) return; await api('/api/admin/students/' + id, { method: 'DELETE' }); AdminView('#/admin/students'); }
async function notifyOne(id) { location.hash = '#/admin/notify'; setTimeout(() => { const c = document.querySelector('[name=all]'); if (c) { c.checked = false; c.onchange(); } const box = document.querySelector(`[name=uid][value="${id}"]`); if (box) box.checked = true; }, 600); }
async function toggleExam(id, v) { const e = (await api('/api/admin/exams')).find(x => x.id === id); e.is_active = v ? true : false; await api('/api/admin/exams/' + id, { method: 'PUT', body: JSON.stringify(e) }); AdminView('#/admin/exams'); }
async function delExam(id) { if (!confirm('حذف الامتحان وأسئلته؟')) return; await api('/api/admin/exams/' + id, { method: 'DELETE' }); AdminView('#/admin/exams'); }
async function addExam(e) { e.preventDefault(); const f = new FormData(e.target); await api('/api/admin/exams', { method: 'POST', body: JSON.stringify({ title: f.get('title'), chapter: f.get('chapter'), duration_min: +f.get('duration_min'), max_pause_min: +f.get('max_pause_min'), pause_enabled: !!f.get('pause_enabled') }) }); AdminView('#/admin/exams'); return false; }
async function addQ(e, exId) { e.preventDefault(); const f = new FormData(e.target); const b = { exam_id: exId }; for (const [k, v] of f.entries()) b[k] = v; await api('/api/admin/questions', { method: 'POST', body: JSON.stringify(b) }); AdminView('#/admin/questions'); return false; }
async function delQ(id) { if (!confirm('حذف السؤال؟')) return; await api('/api/admin/questions/' + id, { method: 'DELETE' }); AdminView('#/admin/questions'); }
async function editQ(id) {
  const qs = await api('/api/admin/questions'); const q = qs.find(x => x.id === id); if (!q) return;
  const body = prompt('نص السؤال:', q.body); if (body === null) return;
  const cor = prompt('الإجابة الصحيحة (A/B/C/D):', q.correct_choice); if (!cor || !['A', 'B', 'C', 'D'].includes(cor.toUpperCase())) { alert('قيمة غير صالحة'); return; }
  await api('/api/admin/questions/' + id, { method: 'PUT', body: JSON.stringify({ ...q, body, correct_choice: cor.toUpperCase() }) });
  AdminView('#/admin/questions');
}
async function admReports() { /* re-render with query */ const q = $('#rq').value; location.hash = '#/admin/reports'; }
async function sendNotif(e) {
  e.preventDefault(); const f = new FormData(e.target);
  const uids = f.getAll('uid').map(Number);
  await api('/api/admin/notify', { method: 'POST', body: JSON.stringify({ title: f.get('title'), message: f.get('message'), all: !!f.get('all'), user_ids: uids }) });
  alert('تم الإرسال ✅'); AdminView('#/admin/notify'); return false;
}
async function saveSettings(e) {
  e.preventDefault(); const f = new FormData(e.target);
  const b = {}; for (const k of ['exam_duration_min', 'max_pause_min', 'leaderboard_threshold', 'leaderboard_limit']) b[k] = f.get(k);
  for (const k of ['pause_enabled', 'registration_enabled', 'maintenance_mode']) b[k] = f.get(k) ? '1' : '0';
  await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(b) });
  alert('تم الحفظ ✅'); return false;
}

boot();
