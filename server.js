// Entry: seed (idempotent) then listen. Admin account seeded server-side from env secrets.
const app = require('./src/app');
const seed = require('./src/seed');

seed().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Chemistry exam platform running on http://localhost:${PORT}`));
}).catch(e => { console.error(e); process.exit(1); });
