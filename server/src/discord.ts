// Discord side: students type /stuck, the bot tells them when help is coming,
// and posts one fix to the class when several hit the same wall.
import {
  ChatInputCommandInteraction, Client, Events, GatewayIntentBits, MessageFlags, REST, Routes,
  SlashCommandBuilder, type Guild, type SendableChannels,
} from 'discord.js';
import { newId, room, save, waitingOf, type Ticket } from './store.ts';
import { recapText } from './recap.ts';

export interface Hooks { onNewTicket(roomId: string, t: Ticket): void }

const ROOM = process.env.ROOM ?? 'demo';
const followUps = new Map<string, { i: ChatInputCommandInteraction; at: number }>();
const lastSeat = new Map<string, string>();

const commands = [
  new SlashCommandBuilder().setName('stuck').setDescription('Ask for help. A mentor will come to you.')
    .addStringOption((o) => o.setName('problem').setDescription('What is going wrong? One line is fine.').setRequired(true).setMaxLength(300))
    .addStringOption((o) => o.setName('seat').setDescription('Where are you? Seat number, table or room').setMaxLength(12)),
  new SlashCommandBuilder().setName('unstuck').setDescription('Remove yourself from the help queue (you figured it out).'),
  new SlashCommandBuilder().setName('recap').setDescription('Post a summary of this session (for the teacher).'),
].map((c) => c.toJSON());

export const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function register(guild: Guild) {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_APP_ID!, guild.id), { body: commands });
  console.log(`[discord] commands ready in "${guild.name}"`);
}

export function startDiscord(hooks: Hooks) {
  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] logged in as ${c.user.tag}`);
    for (const g of c.guilds.cache.values()) await register(g).catch((e) => console.error('[discord] register', e.message));
  });
  client.on(Events.GuildCreate, (g) => { register(g).catch((e) => console.error('[discord] register', e.message)); });

  client.on(Events.InteractionCreate, async (i) => {
    if (!i.isChatInputCommand()) return;
    const r = room(ROOM);
    try {
      if (i.commandName === 'stuck') {
        const raw = i.options.getString('problem', true).trim();
        const seat = (i.options.getString('seat') ?? lastSeat.get(i.user.id) ?? '?').trim();
        lastSeat.set(i.user.id, seat);
        const existing = r.tickets.find((t) => t.userId === i.user.id && t.status === 'waiting');
        if (existing) existing.status = 'cancelled'; // one open request per student; newest wins
        const t: Ticket = {
          id: newId('t'), seat, name: i.user.displayName ?? i.user.username, problem: raw, rawProblem: raw,
          createdAt: Date.now(), status: 'waiting', userId: i.user.id, channelId: i.channelId,
        };
        r.tickets.push(t); save();
        const pos = waitingOf(r).length;
        await i.reply({
          content: `🙋 Got it, you're **#${pos}** in line${seat === '?' ? '' : ` (seat ${seat})`}. Keep trying while you wait. I'll tell you when a mentor is on the way.`
            + (seat === '?' ? '\nTip: add `seat:` next time so the mentor can find you.' : ''),
          flags: MessageFlags.Ephemeral,
        });
        followUps.set(t.id, { i, at: Date.now() });
        hooks.onNewTicket(ROOM, t);
      } else if (i.commandName === 'unstuck') {
        const mine = r.tickets.filter((t) => t.userId === i.user.id && t.status === 'waiting');
        mine.forEach((t) => (t.status = 'cancelled')); save();
        await i.reply({ content: mine.length ? '👍 Nice, you are off the queue.' : 'You are not in the queue.', flags: MessageFlags.Ephemeral });
      } else if (i.commandName === 'recap') {
        await i.reply({ content: recapText(r) });
      }
    } catch (e) {
      console.error('[discord] interaction', e);
    }
  });

  return client.login(process.env.DISCORD_TOKEN);
}

/** Private message to one student: prefer the ephemeral follow-up (no DM settings needed). */
export async function tell(t: Ticket, text: string) {
  if (!t.userId) return; // joined from the web page, no Discord account
  const f = followUps.get(t.id);
  if (f && Date.now() - f.at < 14 * 60_000) {
    try { await f.i.followUp({ content: text, flags: MessageFlags.Ephemeral }); return; } catch { /* fall through */ }
  }
  try { await (await client.users.fetch(t.userId)).send(text); } catch (e) { console.warn('[discord] could not reach student', (e as Error).message); }
}

export async function postToClass(channelId: string, text: string) {
  if (!channelId || !client.isReady()) return;
  const ch = await client.channels.fetch(channelId);
  if (ch && ch.isSendable()) await (ch as SendableChannels).send({ content: text, allowedMentions: { parse: ['users'] } });
}
