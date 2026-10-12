// Ограничение на заявките по IP – срещу масово изпращане на публичните форми
// и налучкване на пароли. Пази броячите в паметта (един сървър).
export function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, reset }
  return function limiter(req, res, next) {
    if (process.env.NODE_TEST_CONTEXT && !process.env.RATE_LIMIT_IN_TESTS) return next();
    const now = Date.now();
    if (hits.size > 10000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    const key = req.ip || 'unknown';
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    h.count++;
    if (h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message || 'Твърде много опити. Опитай пак след малко.' });
    }
    next();
  };
}

const MIN = 60 * 1000;
// Границите са с резерв: в магазин или офис много хора излизат с един и същ адрес.
// Вход: до 30 опита за 15 минути от един адрес
export const loginLimit = rateLimit({ windowMs: 15 * MIN, max: 30, message: 'Твърде много опити за вход. Опитай пак след 15 минути.' });
// Публични форми: до 20 изпращания на час от един адрес (отделно за всяка форма)
const SUBMIT = { windowMs: 60 * MIN, max: 20, message: 'Твърде много изпращания от този адрес. Опитай пак по-късно.' };
export const discSubmitLimit = rateLimit(SUBMIT);
export const applyLimit = rateLimit(SUBMIT);
// Проверка на телефон във въпросника: до 40 за 15 минути
export const publicCheckLimit = rateLimit({ windowMs: 15 * MIN, max: 40 });
