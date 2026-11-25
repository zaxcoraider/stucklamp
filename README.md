# Stucklamp

**A help queue for teachers and mentors, on Even Realities G2 glasses.**
Students type `/stuck` in Discord. The mentor walking the room sees who to help next on the glasses, and one tap tells the student "a mentor is on the way". When several students hit the same wall, Claude spots it and one tap posts a single fix to the whole class.

> **Heads Up Hackathon** (Even Realities × TVM Ventures × Daos Hub), Nov 23–29, 2026
> **Track 01 · Messaging & News (Discord)**, with Claude (Track 04) for shortening and grouping problems.

**Try it in your browser:** https://3-80-82-140.sslip.io (play the student on the left and the mentor wearing G2 on the right)
<!-- Demo video: (link added before submission) -->

---

## The problem

You're running a coding class, a university lab or a hackathon help desk. Thirty people are on laptops and some of them are stuck.

- Hands go up, and you can't tell who has been waiting longest.
- Shy students never raise a hand. They just fall behind.
- Five people hit the same `pip install` error, and you explain it five times.
- A help queue on a laptop or phone means looking down at a screen instead of at your students.

Research has already shown that this matters. In Carnegie Mellon's **Lumilo** studies, teachers wearing mixed-reality glasses that showed which students were stuck spent their time on the students who needed it most, and **students learned more** (Holstein, McLaren & Aleven, AIED 2018). Their prototype ran on a HoloLens, which was too heavy to wear for a whole school day. **The G2 looks and wears like ordinary glasses.** Stucklamp is our take on that idea for a normal classroom, using the chat app the class already has open.

## Who it's for

- Teachers of hands-on classes (coding, labs, design) of 10–40 people on laptops
- University teaching assistants running lab sessions
- Bootcamp and hackathon mentors

## How it works

```
 Student (Discord)                      Mentor (G2 glasses)
 ─────────────────                      ───────────────────
 /stuck problem: pip install fails      STUCKLAMP · 3 waiting · 4 helped
        seat: 14
 "🙋 You're #3 in line"                 > Seat 14 · Maya
                                          pip install: externally-managed
                                          waiting 6m   (1/3)
                                        tap: on my way   swipe: next
                       ── tap ──▶
 "🏃 A mentor is on the way to you now"  GOING TO SEAT 14
                                        tap: done
```

**When several students have the same problem:**

```
                                        2 STUCK ON THE SAME THING
                                        pip install blocked (PEP 668)
                                        fix: use a venv, then pip install flask
                                        tap: post fix to class   swipe: skip
                       ── tap ──▶
 💡 @Maya @Omar: 2 of you hit the same problem (pip install blocked).
 Make and activate a virtualenv (python -m venv .venv, then activate it),
 pip install flask inside it, and rerun python app.py from that same shell.
```

### On the glasses (read → act in one tap)

| Screen | Tap | Swipe | Double-tap |
|---|---|---|---|
| Next student (longest wait first) | "on my way" → student is told | next student | – |
| Going to a student | done | – | back to queue |
| N stuck on the same thing | post one fix to the class | skip | – |
| Nobody stuck | – | – | exit |

### In Discord

| Command | Who | What happens |
|---|---|---|
| `/stuck problem: … seat: …` | student | joins the queue (one open request per student, and the seat is remembered) |
| `/unstuck` | student | leaves the queue ("I figured it out") |
| `/recap` | teacher | posts a session summary: how many asked, how many were helped, how many by a class-wide fix, average and longest wait, who is still waiting |

### What Claude does

1. **Shortens** each request to 38 characters or fewer so it fits the 576×288 display, keeping the error name (*"hi sorry my code doesnt run, it says ModuleNotFoundError: No module named flask…"* → *"ModuleNotFoundError: flask missing"*).
2. **Groups** open requests that share one root cause, and writes one fix for the class plus a shorter version for the glasses. It only groups when it is confident. For example, from `externally-managed-environment`, `ModuleNotFoundError: flask`, `pip permission denied` and `CSS grid not centering`, it grouped the three Python ones and left the CSS one alone.

Nothing is posted to the class until the mentor taps.

## Architecture

```
Discord (/stuck, /unstuck, /recap)          Students without Discord (web form)
        │                                              │
        ▼                                              ▼
┌──────────────────────── server/ (Node 24, TypeScript) ────────────────────────┐
│ discord.ts  slash commands, "mentor on the way" follow-ups, class-wide posts │
│ claude.ts   shorten() + cluster(), structured JSON output                    │
│ store.ts    the queue (in memory, snapshot to data.json)                      │
│ index.ts    HTTP API for the glasses                                         │
└───────────────────────────────────────▲───────────────────────────────────────┘
                                        │ HTTPS, polled every 3 s
                 glasses/ (Vite + TypeScript + @evenrealities/even_hub_sdk)
                 runs in the Even app WebView → G2 display, touchpad, R1 ring
```

| Endpoint | Used by |
|---|---|
| `GET /api/rooms/:room` | glasses: queue + groups (no Discord IDs) |
| `POST /api/rooms/:room/tickets/:id/claim` | glasses tap: "on my way" |
| `POST /api/rooms/:room/tickets/:id/done` | glasses tap: done |
| `POST /api/rooms/:room/clusters/:id/post` | glasses tap: post fix to class |
| `POST /api/rooms/:room/tickets` | web form for students without Discord (max 6 a minute per IP, 30 waiting per room) |
| `POST /api/rooms/try/reset` | "reset this demo" on the public try page (only the public room can be reset) |

## Run it yourself

**You need:** Node 22+ (24 recommended), a Discord bot, a Claude API key, and the Even Hub simulator (`npm i -g @evenrealities/evenhub-simulator`) or a G2.

### 1. Discord bot
1. https://discord.com/developers/applications → **New Application** → **Bot** → **Reset Token** (copy it).
2. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions *Send Messages*, *Send Messages in Threads*, *Read Message History*, *Use Slash Commands*. Open the URL and add the bot to your server.
3. **General Information** → copy the **Application ID**.

### 2. Server
```bash
cd server
cp .env.example .env        # paste DISCORD_TOKEN, DISCORD_APP_ID, ANTHROPIC_API_KEY
npm install
npm start                   # http://localhost:8787, slash commands register automatically
```
To reach Claude through an Anthropic-compatible gateway (we used DGrid), copy `.env.gateway.example` to `.env.gateway`. The key is then sent as a Bearer token and requests use plain JSON mode.

### 3. Glasses app
```bash
cd glasses
cp .env.example .env        # VITE_SERVER_URL=http://localhost:8787
npm install
npx vite --port 5173
evenhub-simulator http://127.0.0.1:5173/
```
- **Browser preview:** open http://127.0.0.1:5173/ (Enter = tap, ↑/↓ = swipe, Space = double-tap).
- **No server running?** The app switches to a built-in demo class, so it always shows something.
- **On a real G2:** build with `npm run build`, add your server URL to `app.json` → `permissions.network.whitelist`, then `evenhub pack app.json dist`.

## Privacy and safety

- **Student data stays small:** display name, seat and the problem text. No email addresses and no message history. The glasses never receive Discord user IDs.
- **The mentor decides:** Claude only suggests. Nothing reaches the class without a tap on the glasses.
- **Private replies:** "a mentor is on the way" is sent as a private reply only that student can see (with a DM fallback), not posted to the channel.
- **Third parties:** problem text is sent to Claude, through the Anthropic API or the gateway you configure, to shorten and group it. If your school's policy needs it, run with the direct Anthropic API.
- **Keys:** the bot token and API keys live only in `server/.env` on the server and are never in the glasses app or this repo.
- **Not a grading or monitoring tool:** it only shows students who asked for help.

## Built during the hackathon

All code in this repository was written during the build week (Nov 23–29, 2026). We used existing open-source libraries and APIs (discord.js, the Anthropic SDK, zod, Vite, and the Even Hub SDK, CLI and simulator). The idea draws on published research (CMU Lumilo, credited above). No code from it was used.

## Feature requests for Even Hub

1. **Glanceable notification while another app is open:** a one-line "Seat 14 needs help" banner even when Stucklamp isn't in the foreground.
2. **Server push (WebSocket or SSE) allowed in the WebView whitelist**, so apps don't have to poll.
3. **Wildcard or pattern whitelist entries** in `app.json` for self-hosted servers.
4. **Bigger font size per text container**, for one number or name readable at a glance while walking.
5. **Built-in speech-to-text from the SDK**, so a short voice note doesn't need a separate STT service.

## License

MIT
