import { db } from './db.js';
import { levelFor } from './levels.js';

const PASS_SCORE = 80; // минимален % за преминаване на тест

// Стойност на модула за прогреса: завършен (одобрен) = 1,
// в процес / предаден и чака решение = 0.5, незапочнат = 0
function moduleValue(status) {
  if (status === 'completed') return 1;
  if (status === 'in_progress' || status === 'submitted') return 0.5;
  return 0;
}

// Модулите се отключват едва след като служителят попълни личностния въпросник.
function discMissing(userId) {
  const u = db.prepare('SELECT role, disc_result FROM users WHERE id = ?').get(userId);
  return !!u && u.role === 'employee' && !u.disc_result;
}

// Тестът вече е предаден (чака решение) или модулът е одобрен – служителят не може да го прави пак.
export const testClosed = (status) => status === 'submitted' || status === 'completed';

// Връща целия каталог за конкретен потребител с изчислен прогрес.
export function getCatalog(userId) {
  const categories = db.prepare('SELECT * FROM categories ORDER BY order_index, id').all();
  const modules = db.prepare('SELECT * FROM modules ORDER BY order_index, id').all();
  const progressRows = db.prepare('SELECT module_id, status, score, completed_at, submitted_at, attempts FROM progress WHERE user_id = ?').all(userId);
  const discRequired = discMissing(userId);
  const progById = new Map(progressRows.map((p) => [p.module_id, p]));

  let totalVal = 0;
  let totalModules = 0;
  let completedModules = 0;

  const cats = categories.map((cat) => {
    const mods = modules
      .filter((m) => m.category_id === cat.id)
      .map((m) => {
        const p = progById.get(m.id) || { status: 'not_started', score: null };
        return {
          id: m.id, title: m.title, summary: m.summary, duration: m.duration ?? null,
          order_index: m.order_index,
          status: p.status, score: p.score ?? null,
          completed_at: p.completed_at ?? null,
          submitted_at: p.submitted_at ?? null,
          attempts: p.attempts ?? 0,
        };
      });

    // Последователно отключване: първият модул е отключен, всеки следващ –
    // само след като ментор/управител е одобрил предишния.
    let prevCompleted = true;
    mods.forEach((mm) => {
      mm.locked = discRequired || !prevCompleted;
      prevCompleted = mm.status === 'completed';
    });

    const catVal = mods.reduce((s, m) => s + moduleValue(m.status), 0);
    const done = mods.filter((m) => m.status === 'completed').length;
    const percent = mods.length ? Math.round((catVal / mods.length) * 100) : 0;

    totalVal += catVal;
    totalModules += mods.length;
    completedModules += done;

    return {
      id: cat.id, slug: cat.slug, title: cat.title, icon: cat.icon,
      description: cat.description,
      modules: mods,
      moduleCount: mods.length,
      completedCount: done,
      percent,
      completed: mods.length > 0 && done === mods.length,
    };
  });

  const overall = totalModules ? Math.round((totalVal / totalModules) * 100) : 0;
  const level = levelFor(overall);

  return {
    categories: cats,
    discRequired,
    pendingReviews: cats.reduce((s, c) => s + c.modules.filter((m) => m.status === 'submitted').length, 0),
    overall,
    level: level.name,
    levelKey: level.key,
    totalModules,
    completedModules,
    completedCategories: cats.filter((c) => c.completed).length,
    totalCategories: cats.length,
  };
}

// Един модул + въпросите му (без верните отговори).
export function getModule(userId, moduleId) {
  const m = db.prepare('SELECT * FROM modules WHERE id = ?').get(moduleId);
  if (!m) return null;
  const category = db.prepare('SELECT id, slug, title, icon FROM categories WHERE id = ?').get(m.category_id);
  const questions = db
    .prepare('SELECT id, text, options FROM questions WHERE module_id = ? ORDER BY order_index, id')
    .all(moduleId)
    .map((q) => ({ id: q.id, text: q.text, options: JSON.parse(q.options) }));
  const p = db.prepare('SELECT status, score, completed_at, submitted_at, attempts FROM progress WHERE user_id = ? AND module_id = ?').get(userId, moduleId);

  // подредба вътре в категорията – за "следващ модул" и заключване
  const siblings = db.prepare('SELECT id FROM modules WHERE category_id = ? ORDER BY order_index, id').all(m.category_id);
  const idx = siblings.findIndex((s) => s.id === m.id);
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;

  const discRequired = discMissing(userId);
  const locked = moduleLocked(userId, moduleId);

  return {
    id: m.id, title: m.title, summary: m.summary, content: m.content, video_url: m.video_url, duration: m.duration ?? null,
    category,
    questions,
    passScore: PASS_SCORE,
    status: p?.status || 'not_started',
    score: p?.score ?? null,
    completed_at: p?.completed_at ?? null,
    submitted_at: p?.submitted_at ?? null,
    attempts: p?.attempts ?? 0,
    testLocked: testClosed(p?.status),
    nextModuleId: nextId,
    locked,
    discRequired,
  };
}

// Заключен ли е модулът за този потребител (за защита на сървъра).
export function moduleLocked(userId, moduleId) {
  const m = db.prepare('SELECT category_id FROM modules WHERE id = ?').get(moduleId);
  if (!m) return false;
  if (discMissing(userId)) return true;
  const sibs = db.prepare('SELECT id FROM modules WHERE category_id = ? ORDER BY order_index, id').all(m.category_id);
  const idx = sibs.findIndex((s) => s.id === Number(moduleId));
  if (idx <= 0) return false;
  const prev = db.prepare('SELECT status FROM progress WHERE user_id = ? AND module_id = ?').get(userId, sibs[idx - 1].id);
  return prev?.status !== 'completed';
}

// Отбелязва модула като "в процес" при отваряне (ако още не е завършен).
export function markOpened(userId, moduleId) {
  const existing = db.prepare('SELECT status FROM progress WHERE user_id = ? AND module_id = ?').get(userId, moduleId);
  if (testClosed(existing?.status)) return;
  db.prepare(`
    INSERT INTO progress (user_id, module_id, status, updated_at)
    VALUES (?, ?, 'in_progress', datetime('now'))
    ON CONFLICT(user_id, module_id) DO UPDATE SET status='in_progress', updated_at=datetime('now')
  `).run(userId, moduleId);
}

// Оценява подадените отговори и записва резултата.
// Независимо от оценката модулът се заключва („предаден“) – ментор или управител
// решава дали служителят продължава към следващия, или повтаря.
export function submitTest(userId, moduleId, answers) {
  const questions = db.prepare('SELECT id, correct_index FROM questions WHERE module_id = ? ORDER BY order_index, id').all(moduleId);
  if (questions.length === 0) return { error: 'Този модул няма тест.', code: 400 };

  const prev = db.prepare('SELECT status FROM progress WHERE user_id = ? AND module_id = ?').get(userId, moduleId);
  if (testClosed(prev?.status)) return { error: 'Тестът вече е предаден. Ментор или управител ще реши как продължаваш.', code: 409 };

  const correct = questions.filter((q) => Number(answers?.[q.id]) === q.correct_index).length;
  const score = Math.round((correct / questions.length) * 100);

  db.prepare(`
    INSERT INTO progress (user_id, module_id, status, score, attempts, submitted_at, updated_at)
    VALUES (?, ?, 'submitted', ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, module_id) DO UPDATE SET
      status='submitted', score=excluded.score, attempts=progress.attempts + 1,
      submitted_at=datetime('now'), updated_at=datetime('now')
  `).run(userId, moduleId, score);

  // Без верните отговори – тестът може да бъде върнат за повторение.
  return { score, passed: score >= PASS_SCORE, passScore: PASS_SCORE, correct, total: questions.length };
}

// Решение на ментор/управител по предаден тест.
//  approve – модулът е завършен, следващият се отключва;
//  retry   – служителят прави теста отново.
export function reviewModule(userId, moduleId, decision) {
  const p = db.prepare('SELECT status FROM progress WHERE user_id = ? AND module_id = ?').get(userId, moduleId);
  if (decision !== 'approve' && decision !== 'retry') return { error: 'Непознато решение.', code: 400 };
  if (p?.status !== 'submitted') return { error: 'Няма предаден тест, който да чака решение.', code: 409 };
  if (decision === 'approve') {
    db.prepare("UPDATE progress SET status='completed', completed_at=datetime('now'), updated_at=datetime('now') WHERE user_id = ? AND module_id = ?").run(userId, moduleId);
    return { ok: true };
  }
  db.prepare("UPDATE progress SET status='in_progress', updated_at=datetime('now') WHERE user_id = ? AND module_id = ?").run(userId, moduleId);
  return { ok: true };
}

export { PASS_SCORE };
