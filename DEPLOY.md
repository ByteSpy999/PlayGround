# تشغيل ونشر منصة امتحان الكيمياء ⚗️

## المتطلبات
- Node.js 18+
- لا حاجة لقاعدة بيانات خارجية (SQLite مدمجة في `./data/app.db`)

## التشغيل المحلي
```bash
npm install
cp .env.example .env   # ثم ضع القيم الحقيقية
# .env:
#   PORT=3000
#   SESSION_SECRET=<random-32-chars>
#   ADMIN_EMAIL=<admin-email>
#   ADMIN_PASSWORD=<strong-password>
npm start
```
افتح: http://localhost:3000

أول تشغيل يقوم تلقائيًا بـ:
- إنشاء جداول قاعدة البيانات
- إنشاء امتحان «الكيمياء – الباب الأول» + 60 سؤالًا استرشاديًا (مميزة Sample)
- إنشاء حساب الأدمن من `ADMIN_EMAIL` / `ADMIN_PASSWORD` (لا تُكتب في أي كود frontend)

## حساب الأدمن
- الدخول من صفحة الدخول ← «دخول الأدمن» أسفل الصفحة.
- لا توجد كلمات سر داخل كود الواجهة — كل التحقق server-side + دور `ADMIN`.

## اختبار سريع
```bash
npm test   # smoke test على قاعدة مؤقتة: تسجيل → امتحان → إيقاف → تسليم → تصحيح → أدمن
```

## النشر (VPS / Render / Railway)
1. اضبط متغيرات البيئة: `PORT` `SESSION_SECRET` `ADMIN_EMAIL` `ADMIN_PASSWORD`.
2. الأمر: `npm install && npm start`
3. البيانات تبقى في `data/app.db` — فعّل قرصًا دائمًا (persistent disk) لهذا المجلد.
4. يُفضّل التشغيل خلف HTTPS (reverse proxy) — الجلسات httpOnly + SameSite=Lax جاهزة.

## ملاحظات أمنية
- كلمات المرور Argon2id، الجلسات مخزنة server-side في جدول `sessions`.
- الإجابات الصحيحة لا تُرسل للمتصفح قبل التسليم — التصحيح والعداد (timer) على الخادم.
- Rate-limit على الدخول، تحقق من الدور في كل API إداري، سجل تدقيق `audit_logs`.
