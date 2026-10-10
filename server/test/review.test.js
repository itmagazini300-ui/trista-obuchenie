import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, addUser, db } from './helpers.js';

// Искания на HR (2026-10-10):
// – личностният въпросник се попълва веднъж и после се заключва;
// – модулите са достъпни едва след въпросника;
// – след предаден тест модулът се заключва независимо от оценката,
//   а ментор/управител решава: следващ модул или повторение.

let srv, mgr, mentor, other, emp, catId, m1, m2;
const DISC_ALL_D = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 'D']));

before(async () => {
  addUser({ name: 'Упр', email: 'm@t.bg', role: 'manager' });
  addUser({ name: 'Ана Ментор', phone: '0888000101', is_mentor: 1, mentor_style: 'I' });
  addUser({ name: 'Друг Ментор', phone: '0888000102', is_mentor: 1, mentor_style: 'S' });
  catId = Number(db.prepare("INSERT INTO categories (slug, title, icon, order_index) VALUES ('rev', 'Рев', 'book', 99)").run().lastInsertRowid);
  const addMod = (t, i) => {
    const id = Number(db.prepare('INSERT INTO modules (category_id, title, content, order_index) VALUES (?, ?, ?, ?)').run(catId, t, 'текст', i).lastInsertRowid);
    db.prepare("INSERT INTO questions (module_id, text, options, correct_index) VALUES (?, 'В?', '[\"а\",\"б\"]', 0)").run(id);
    db.prepare("INSERT INTO questions (module_id, text, options, correct_index) VALUES (?, 'В2?', '[\"а\",\"б\"]', 0)").run(id);
    return id;
  };
  m1 = addMod('Първи', 0);
  m2 = addMod('Втори', 1);
  srv = await startServer();
  mgr = makeClient(srv.base);
  mentor = makeClient(srv.base);
  other = makeClient(srv.base);
  assert.equal((await mgr('POST', '/auth/login', { login: 'm@t.bg', password: 'test123' })).status, 200);
  assert.equal((await mentor('POST', '/auth/login', { login: '0888000101', password: 'test123' })).status, 200);
  assert.equal((await other('POST', '/auth/login', { login: '0888000102', password: 'test123' })).status, 200);
});
after(() => srv.close());

let empId;
beforeEach(async () => {
  db.exec("DELETE FROM progress; DELETE FROM users WHERE role = 'employee' AND is_mentor = 0");
  empId = addUser({ name: 'Нов Служител', phone: '0899000201', mentor: 'Ана Ментор' });
  emp = makeClient(srv.base);
  assert.equal((await emp('POST', '/auth/login', { login: '0899000201', password: 'test123' })).status, 200);
});

const questionIds = (mid) => db.prepare('SELECT id FROM questions WHERE module_id = ? ORDER BY id').all(mid).map((q) => q.id);
const answersFor = (mid, idx) => Object.fromEntries(questionIds(mid).map((id) => [id, idx]));
const status = (mid) => db.prepare('SELECT status FROM progress WHERE user_id = ? AND module_id = ?').get(empId, mid)?.status;

test('въпросникът се попълва само веднъж', async () => {
  assert.equal((await emp('POST', '/learn/disc', { answers: DISC_ALL_D })).status, 200);
  const again = await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  assert.equal(again.status, 409);
});

test('модулите са заключени, докато не е попълнен въпросникът', async () => {
  const cat = (await emp('GET', '/learn/catalog')).data;
  assert.equal(cat.discRequired, true);
  assert.ok(cat.categories.find((c) => c.id === catId).modules.every((m) => m.locked));
  assert.equal((await emp('POST', `/learn/modules/${m1}/open`)).status, 403);
  assert.equal((await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) })).status, 403);

  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  const after = (await emp('GET', '/learn/catalog')).data;
  assert.equal(after.discRequired, false);
  assert.equal(after.categories.find((c) => c.id === catId).modules[0].locked, false);
});

test('след предаване модулът се заключва дори при 100% и следващият не се отключва сам', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  const r = await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) });
  assert.equal(r.status, 200);
  assert.equal(r.data.score, 100);
  assert.equal(r.data.review, undefined, 'верните отговори не се показват');
  assert.equal(status(m1), 'submitted');
  assert.equal((await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) })).status, 409);
  const mod2 = (await emp('GET', `/learn/modules/${m2}`)).data;
  assert.equal(mod2.locked, true);
  const mod1 = (await emp('GET', `/learn/modules/${m1}`)).data;
  assert.equal(mod1.testLocked, true);
});

test('слаб резултат също заключва модула', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  const r = await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 1) });
  assert.equal(r.data.score, 0);
  assert.equal(status(m1), 'submitted');
  assert.equal((await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) })).status, 409);
});

test('менторът одобрява → следващият модул се отключва', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 1) });
  const a = await mentor('POST', `/review/employees/${empId}/modules/${m1}/approve`);
  assert.equal(a.status, 200);
  assert.equal(status(m1), 'completed');
  assert.equal((await emp('GET', `/learn/modules/${m2}`)).data.locked, false);
});

test('управителят връща за повторение → тестът пак може да се направи', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 1) });
  assert.equal((await mgr('POST', `/review/employees/${empId}/modules/${m1}/retry`)).status, 200);
  assert.equal(status(m1), 'in_progress');
  assert.equal((await emp('GET', `/learn/modules/${m2}`)).data.locked, true);
  const r = await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) });
  assert.equal(r.status, 200);
  const p = db.prepare('SELECT attempts, score FROM progress WHERE user_id = ? AND module_id = ?').get(empId, m1);
  assert.equal(p.attempts, 2);
  assert.equal(p.score, 100);
});

test('одобрение без предаден тест не става', async () => {
  assert.equal((await mgr('POST', `/review/employees/${empId}/modules/${m1}/approve`)).status, 409);
});

test('чужд ментор и самият служител не могат да решават', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) });
  assert.equal((await other('POST', `/review/employees/${empId}/modules/${m1}/approve`)).status, 403);
  assert.equal((await emp('POST', `/review/employees/${empId}/modules/${m1}/approve`)).status, 403);
  assert.equal((await other('GET', `/review/employees/${empId}`)).status, 403);
  assert.equal(status(m1), 'submitted');
});

test('менторът вижда своите обучаеми и чакащите решения', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) });
  const { status: st, data } = await mentor('GET', '/review/mentees');
  assert.equal(st, 200);
  const me = data.mentees.find((x) => x.id === empId);
  assert.ok(me);
  assert.equal(me.pendingReviews, 1);
  assert.equal((await other('GET', '/review/mentees')).data.mentees.length, 0);
  assert.equal((await emp('GET', '/review/mentees')).status, 403);
  const det = await mentor('GET', `/review/employees/${empId}`);
  assert.equal(det.status, 200);
  assert.equal(det.data.employee.name, 'Нов Служител');
});

test('управителят може да разреши ново попълване на въпросника', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  assert.equal((await mgr('POST', `/review/employees/${empId}/disc/reset`)).status, 200);
  assert.equal((await emp('POST', '/learn/disc', { answers: DISC_ALL_D })).status, 200);
});

test('таблото брои чакащите решения', async () => {
  await emp('POST', '/learn/disc', { answers: DISC_ALL_D });
  await emp('POST', `/learn/modules/${m1}/submit`, { answers: answersFor(m1, 0) });
  const { data } = await mgr('GET', '/manager/overview');
  assert.equal(data.employees.find((e) => e.id === empId).pendingReviews, 1);
  assert.ok(data.stats.pendingReviews >= 1);
});
