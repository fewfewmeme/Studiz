// Activity log: what happened to which file (imported, updated, moved, deleted, restored, backup). Part of the backup (kv).
import * as db from './db.js';
const KEY = 'journal', CAP = 600;
export async function logEvent(kind, name, detail = '') {
  try {
    const list = await db.kvGet(KEY, []);
    list.push({ ts: Date.now(), kind, name: name || '', detail });
    await db.kvSet(KEY, list.slice(-CAP));
  } catch { /* the log must never break an action */ }
}
export async function readJournal() { return (await db.kvGet(KEY, [])).slice().reverse(); }
export const KIND_RU = { imported: 'Добавлен', updated: 'Обновлён', moved: 'Перемещён', renamed: 'Переименован', trashed: 'В корзине', restored: 'Восстановлен', deleted: 'Удалён навсегда', backup: 'Копия сделана', restore: 'Восстановление из копии', purged: 'Корзина очищена' };
