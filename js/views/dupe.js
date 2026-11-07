// «Это уже есть?»: says WHERE the existing document lives and shows its card; trash matches are a separate, honest question.
import { h } from '../util.js';
import { customDialog } from '../ui.js';
import { docCard } from './common.js';
import { whereIs } from '../library.js';

const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

// -> 'update' | 'separate' | 'skip' | 'open' | 'restore-update' | null
export async function duplicateDialog(file, dup) {
  const trashOnly = !dup.live && dup.trashed;
  const f = dup.live || dup.trashed;
  const w = await whereIs(f);
  const same = !trashOnly && dup.liveBy === 'hash';
  const where = `Предмет «${w.subject}»${w.folder ? ', папка «' + w.folder + '»' : ''}. Добавлен ${fmtDate(w.added)}.`;
  return new Promise(resolve => {
    const done = v => { m.close(); resolve(v); };
    const card = h('div', { class: 'dupe-card' }, docCard(f));
    card.querySelector('a')?.addEventListener('click', e => e.preventDefault());
    const btn = (label, value, cls = '') => h('button', { class: 'btn ' + cls, onclick: () => done(value) }, label);
    let title, text, buttons;
    if (trashOnly) {
      title = 'Такой документ в Корзине';
      text = `«${f.name}» лежит в Корзине (удалён ${fmtDate(f.deleted)}). ${where}`;
      buttons = [btn('Восстановить и обновить', 'restore-update', 'btn-primary'), btn('Добавить как новый', 'separate'), btn('Пропустить', 'skip', 'btn-quiet')];
    } else if (same) {
      title = 'Этот файл уже есть';
      text = `Точно такой же файл: «${f.name}». ${where}`;
      buttons = [btn('Открыть уже добавленный', 'open', 'btn-primary'), btn('Всё равно добавить', 'separate'), btn('Пропустить', 'skip', 'btn-quiet')];
    } else {
      title = 'Есть новая версия?';
      text = `«${f.name}» уже есть. ${where} Обновить документ? Прогресс и пометки останутся.`;
      buttons = [btn('Обновить документ', 'update', 'btn-primary'), btn('Добавить как отдельный', 'separate'), btn('Пропустить', 'skip', 'btn-quiet')];
    }
    const m = customDialog([h('h3', null, title), h('p', { class: 'modal-text' }, text), card, h('div', { class: 'modal-stack' }, ...buttons)], { onBackdrop: () => done('skip') });
  });
}
