import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { getCatalog, reviewModule } from '../progressCalc.js';
import { companyOfStore } from '../companyOf.js';

// Решения по обучението на служител: одобрение/повторение на предаден тест
// и разрешаване на ново попълване на личностния въпросник.
// Може управител (за всеки служител) или менторът на служителя.
const router = Router();
router.use(requireAuth);

function loadEmployee(id) {
  return db.prepare("SELECT id, name, email, phone, store, position, mentor, start_date, disc_result, disc_taken_at FROM users WHERE id = ? AND role = 'employee'").get(id);
}

function canReview(user, emp) {
  if (user.role === 'manager') return true;
  return !!user.is_mentor && emp.mentor === user.name && emp.id !== user.id;
}

// Зарежда служителя и проверява правата; иначе връща отговор с грешка.
function withEmployee(req, res) {
  const emp = loadEmployee(Number(req.params.id));
  if (!emp) { res.status(404).json({ error: 'Служителят не е намерен.' }); return null; }
  if (!canReview(req.user, emp)) { res.status(403).json({ error: 'Нямаш права за този служител.' }); return null; }
  return emp;
}

// Обучаемите на влезлия ментор
router.get('/mentees', (req, res) => {
  if (!req.user.is_mentor) return res.status(403).json({ error: 'Тази страница е само за ментори.' });
  const rows = db.prepare("SELECT id, name, store, position, start_date, disc_result, mentorship_done_at FROM users WHERE mentor = ? AND role = 'employee' AND id != ? ORDER BY name")
    .all(req.user.name, req.user.id)
    .map((e) => {
      const c = getCatalog(e.id);
      return {
        ...e, company: companyOfStore(e.store),
        overall: c.overall, level: c.level,
        completedModules: c.completedModules, totalModules: c.totalModules,
        pendingReviews: c.pendingReviews,
      };
    });
  res.json({ mentees: rows, pendingReviews: rows.reduce((s, r) => s + r.pendingReviews, 0) });
});

// Детайл по модули – същият вид като при управителя
router.get('/employees/:id', (req, res) => {
  const emp = withEmployee(req, res);
  if (!emp) return;
  res.json({ employee: { ...emp, company: companyOfStore(emp.store) }, ...getCatalog(emp.id) });
});

for (const decision of ['approve', 'retry']) {
  router.post(`/employees/:id/modules/:moduleId/${decision}`, (req, res) => {
    const emp = withEmployee(req, res);
    if (!emp) return;
    const r = reviewModule(emp.id, Number(req.params.moduleId), decision);
    if (r.error) return res.status(r.code).json({ error: r.error });
    res.json({ ok: true });
  });
}

// Разрешава ново попълване на личностния въпросник
router.post('/employees/:id/disc/reset', (req, res) => {
  const emp = withEmployee(req, res);
  if (!emp) return;
  db.prepare('UPDATE users SET disc_result = NULL, disc_taken_at = NULL WHERE id = ?').run(emp.id);
  res.json({ ok: true });
});

export default router;
