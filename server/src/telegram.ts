// Telegram side: the same /stuck flow in a Telegram group (Bot API, long polling, no extra library).
import { newId, room, save, waitingOf, type Ticket } from './store.ts';
import { recapWithInsight } from './recap.ts';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ROOM = process.env.ROOM ?? 'demo';
let botUsername = 'stucklamp_bot';
const API = `https://api.telegram.org/bot${TOKEN}`;
export const telegramOn = !!TOKEN;

export interface TgHooks { onNewTicket(roomId: string, t: Ticket): void; onSelfSolved(roomId: string, ticketId: string): boolean }

async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${API}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description ?? r.status}`);
  return j.result;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mention = (t: Ticket) => (t.tg ? `<a href="tg://user?id=${t.tg.user}">${esc(t.name)}</a>` : esc(t.name));
const lastSeat = new Map<number, string>();
const toHtml = (md: string) => esc(md).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

/** "/stuck 14 pip fails", "/stuck seat 14: pip fails" or "/stuck pip fails" */
export function parseStuck(text: string): { seat?: string; problem: string } {
  const rest = text.replace(/^\/stuck(@\w+)?/i, '').trim();
  const m = rest.match(/^(?:seat\s*)?([A-Za-z]?\d{1,3}[A-Za-z]?)\s*[:,-]?\s+(.+)$/i);
  return m ? { seat: m[1], problem: m[2].trim() } : { problem: rest };
}

/** Private first (works once the student has opened the bot), otherwise a reply in the group. */
async function toStudent(t: Ticket, html: string, extra: Record<string, unknown> = {}) {
  if (!t.tg) return;
  try { await tg('sendMessage', { chat_id: t.tg.user, text: html, parse_mode: 'HTML', ...extra }); return; } catch { /* not started the bot yet */ }
  try { await tg('sendMessage', { chat_id: t.tg.chat, text: `${mention(t)}: ${html}`, parse_mode: 'HTML', reply_parameters: { message_id: t.tg.msg, allow_sending_without_reply: true }, ...extra }); }
  catch (e) { console.warn('[telegram] could not reach student', (e as Error).message); }
}

export const tgTell = (t: Ticket, md: string) => toStudent(t, toHtml(md));
export const tgHint = (t: Ticket) => t.hint ? toStudent(t,
  `💡 <b>While you wait</b> (hint from Claude, AI): ${esc(t.hint)}\nA mentor is still coming. If this solves it, press the button.`,
  { reply_markup: { inline_keyboard: [[{ text: '✅ That fixed it', callback_data: `solved:${t.id}` }]] } }) : Promise.resolve();

export async function tgPostFix(chat: number, ts: Ticket[], label: string, fix: string) {
  await tg('sendMessage', {
    chat_id: chat, parse_mode: 'HTML',
    text: `💡 ${ts.map(mention).join(' ')}: ${ts.length} of you hit the same problem (<b>${esc(label)}</b>).\n${esc(fix)}\nStill stuck after trying this? Send /stuck again and a mentor will come over.`,
  });
}

async function onMessage(msg: any, hooks: TgHooks) {
  const text: string = msg.text ?? '';
  const from = msg.from; if (!from || from.is_bot) return;
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Student';
  const r = room(ROOM);
  const reply = (html: string) => tg('sendMessage', { chat_id: msg.chat.id, text: html, parse_mode: 'HTML', reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } });

  if (/^\/stuck(@\w+)?\b/i.test(text)) {
    const { seat: s, problem } = parseStuck(text);
    if (!problem) { await reply('Tell me what is wrong, for example:\n<code>/stuck 14 pip install says externally-managed-environment</code>\n(14 is your seat)'); return; }
    const seat = (s ?? lastSeat.get(from.id) ?? '?').slice(0, 12);
    lastSeat.set(from.id, seat);
    for (const t of r.tickets) if (t.tg?.user === from.id && t.status === 'waiting') t.status = 'cancelled'; // newest wins
    const t: Ticket = {
      id: newId('t'), seat, name: name.slice(0, 24), problem: problem.slice(0, 300), rawProblem: problem.slice(0, 300),
      createdAt: Date.now(), status: 'waiting', userId: '', channelId: '', platform: 'telegram',
      tg: { chat: msg.chat.id, user: from.id, msg: msg.message_id },
    };
    r.tickets.push(t); save();
    await reply(`🙋 Got it, you're <b>#${waitingOf(r).length}</b> in line${seat === '?' ? '' : ` (seat ${esc(seat)})`}. Keep trying while you wait. I'll tell you when a mentor is on the way.`
      + (seat === '?' ? '\nTip: start with your seat next time, e.g. <code>/stuck 14 …</code>' : ''));
    hooks.onNewTicket(ROOM, t);
  } else if (/^\/unstuck(@\w+)?\b/i.test(text)) {
    const mine = r.tickets.filter((t) => t.tg?.user === from.id && t.status === 'waiting');
    mine.forEach((t) => (t.status = 'cancelled')); save();
    await reply(mine.length ? '👍 Nice, you are off the queue.' : 'You are not in the queue.');
  } else if (/^\/recap(@\w+)?\b/i.test(text)) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: toHtml(await recapWithInsight(r)), parse_mode: 'HTML' });
  } else if (/^\/start\b/i.test(text) && msg.chat.type === 'private') {
    const site = process.env.PUBLIC_URL ?? 'https://3-80-82-140.sslip.io';
    await tg('sendMessage', {
      chat_id: msg.chat.id, parse_mode: 'HTML',
      text: `🔦 <b>Hi ${esc(from.first_name ?? 'there')}, you're all set.</b>\n\n`
        + `When you get stuck, send this in your class group:\n<code>/stuck 14 pip install fails</code>\n<i>(14 = your seat)</i>\n\n`
        + `💡 I'll send you a hint from Claude right away.\n🏃 I'll tell you here when your mentor is on the way.\n✅ Fixed it yourself? Press the button or send /unstuck.`,
      reply_markup: { inline_keyboard: [
        [{ text: '➕ Add me to your class group', url: `https://t.me/${botUsername}?startgroup=true` }],
        [{ text: '👓 See what the teacher sees', url: `${site}/?room=${ROOM}` }],
      ] },
    });
  }
}

async function onCallback(q: any, hooks: TgHooks) {
  const data: string = q.data ?? '';
  if (!data.startsWith('solved:')) return;
  const t = room(ROOM).tickets.find((x) => x.id === data.slice(7));
  let text = 'This button is for the student who asked.';
  if (t && t.tg?.user === q.from.id) text = hooks.onSelfSolved(ROOM, t.id) ? '🎉 Nice work, you solved it yourself. You are off the queue.' : 'A mentor is already on the way, so let them know it is fixed.';
  await tg('answerCallbackQuery', { callback_query_id: q.id, text, show_alert: false }).catch(() => {});
  if (t && t.tg?.user === q.from.id && q.message) await tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
}

export async function startTelegram(hooks: TgHooks) {
  let me: any;
  for (let attempt = 1; ; attempt++) { // the network can be briefly unavailable right after boot
    try { me = await tg('getMe', {}); break; }
    catch (e) { console.warn(`[telegram] start attempt ${attempt} failed: ${(e as Error).message}`); await new Promise((r) => setTimeout(r, Math.min(30, attempt * 5) * 1000)); }
  }
  await tg('setMyCommands', { commands: [
    { command: 'stuck', description: 'Ask for help: /stuck 14 what is wrong' },
    { command: 'unstuck', description: 'Leave the help queue' },
    { command: 'recap', description: 'Session summary (for the teacher)' },
  ] });
  botUsername = me.username ?? botUsername;
  console.log(`[telegram] logged in as @${me.username}`);
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.message) await onMessage(u.message, hooks).catch((e) => console.error('[telegram] message', e.message));
        if (u.callback_query) await onCallback(u.callback_query, hooks).catch((e) => console.error('[telegram] callback', e.message));
      }
    } catch (e) {
      console.error('[telegram] poll', (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
