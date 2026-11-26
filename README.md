![Stucklamp](brand/discord-banner.png)

# Stucklamp

**A help queue for teachers and mentors, on Even Realities G2 glasses.**
Students type `/stuck` in Discord or Telegram. The mentor walking the room sees who to help next on the glasses, and one tap tells the student "a mentor is on the way". When several students hit the same wall, Claude spots it and one tap posts a single fix to the whole class.

> **Heads Up Hackathon** (Even Realities × TVM Ventures × Daos Hub), Nov 23–29, 2026
> **Track 01 · Messaging & News (Discord + Telegram)**, with Claude (Track 04) for shortening, hints and grouping problems.

| Try it | Link |
|---|---|
| **In your browser** (play the student on the left, the mentor wearing G2 on the right) | https://3-80-82-140.sslip.io |
| **Telegram bot**: add it to a group, send `/stuck 14 what is wrong` | [@stucklamp_bot](https://t.me/stucklamp_bot) |
| **What the bots' mentor sees** (the live room the Discord and Telegram bots use) | https://3-80-82-140.sslip.io/?room=demo |
| **G2 app package** | `stucklamp.ehpk` in [Releases](../../releases) |
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
 Student (Discord/Telegram)                    Mentor (G2 glasses)
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
| Next student (longest wait first) | "on my way" → student is told (if another mentor got there first, you're told instead) | next student | – |
| Going to a student | done (hold: say what fixed it, and it's saved as a note) | – | back to queue |
| N stuck on the same thing | post one fix to the class | skip | – |
| Nobody stuck | – | – | exit |

### In Discord and Telegram

The same three commands work in both. In Telegram, type `/stuck 14 pip install fails` (the first number is the seat).

| Command | Who | What happens |
|---|---|---|
| `/stuck problem: … seat: …` (Discord) · `/stuck 14 …` (Telegram) | student | joins the queue (one open request per student, and the seat is remembered) |
| `/unstuck` | student | leaves the queue ("I figured it out") |
| `/recap` | teacher | posts a session summary: how many asked and solved (by a mentor, by a class-wide fix, or by themselves with a hint), average and longest wait, who is still waiting, and what tripped the class up |

### What Claude does

1. **Shortens** each request to 38 characters or fewer so it fits the 576×288 display, keeping the error name (*"hi sorry my code doesnt run, it says ModuleNotFoundError: No module named flask…"* → *"ModuleNotFoundError: flask missing"*).
2. **Groups** open requests that share one root cause, and writes one fix for the class plus a shorter version for the glasses. It only groups when it is confident. For example, from `externally-managed-environment`, `ModuleNotFoundError: flask`, `pip permission denied` and `CSS grid not centering`, it grouped the three Python ones and left the CSS one alone.

3. **Hints while you wait:** each student gets one private nudge from Claude (not the full answer, so they still learn). If it works, they press **That fixed it** and leave the queue, so the mentor has one less walk.
4. **What tripped the class up:** `/recap` ends with the top recurring problems and one thing to teach differently next time.

Nothing is posted to the class until the mentor taps.

### Tested with real people

**Nov 26, 2026, first live session:** three people in a real Telegram group, on their own phones, with the mentor on the glasses view.

| Measure | Result |
|---|---|
| Help requests | 3, all solved |
| Average wait until "a mentor is on the way" | **2.4 min** (longest 3.1 min) |
| Same-problem grouping | Claude grouped the two `externally-managed-environment` requests on its own |
| Errors or lost requests | 0 |

The `/recap` at the end gave the teacher a concrete next step: *"Open with a 5-minute setup check: create a venv, `pip install requests`, then `python -c "import requests"` so everyone confirms their interpreter matches."*

Small sample, honestly reported. A bigger session is next, and its numbers will be added here.

### Measured (Claude eval)

We tested Claude on 38 synthetic beginner help requests from three kinds of class (Python/Flask, HTML/CSS/JS, Git), with typos and different words for the same cause, over 3 runs. The script and data are in [`server/eval/`](server/eval/), and full results are in [`server/eval/RESULTS.md`](server/eval/RESULTS.md).

| Measure | Result |
|---|---|
| Grouping precision: grouped students who really had the same problem | **1.00** (60 of 60 pairs, 0 wrong) |
| Grouping recall: students with the same problem who were grouped | **0.91** |
| Shortened problem fits the glasses | **38 / 38** |
| Students who got a hint | **38 / 38** |

Precision matters most: a wrong group would send a fix to students who don't need it, so Claude only groups when it is sure. The eval also caught a real bug (the reply was cut off on busy classes), which we fixed before release.

### Voice notes

On the "going" screen, hold the touchpad and say what fixed it ("fixed, he needed to pull before pushing"), then let go. The G2 microphone audio is transcribed **on our own server with [whisper.cpp](https://github.com/ggml-org/whisper.cpp)** (tiny English model, about 3 seconds), so the audio never goes to a third party. The note is saved with the request and shows up in `/recap`.

## Architecture

```
Discord  ·  Telegram  (/stuck, /unstuck, /recap)      Web form (no chat app)
        │                                                    │
        ▼                                                    ▼
┌──────────────────────── server/ (Node 24, TypeScript) ────────────────────────┐
│ discord.ts   slash commands, "mentor on the way", class-wide posts           │
│ telegram.ts  same commands over the Bot API (long polling, no library)       │
│ claude.ts    shorten + hint + cluster + class insight, structured JSON       │
│ recap.ts     /recap: waits, who is still waiting, what tripped the class up  │
│ voice.ts     G2 microphone → whisper.cpp on our own server                   │
│ store.ts     the queue (in memory, snapshot to data.json)                     │
│ index.ts     HTTP API for the glasses                                        │
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
| `POST /api/rooms/:room/tickets/:id/voice` | glasses: raw 16-bit mono PCM voice note, transcribed with whisper.cpp |
| `POST /api/rooms/:room/tickets/:id/selfsolve` | web form: "that fixed it" after Claude's hint |
| `POST /api/rooms/try/reset` | "reset this demo" on the public try page (only the public room can be reset) |

## Repository layout

```
stucklamp/
├── server/          Node + TypeScript: bots, Claude, queue, HTTP API
│   ├── src/         discord.ts · telegram.ts · claude.ts · recap.ts · voice.ts · store.ts · index.ts
│   └── eval/        38-request Claude eval: data, script, RESULTS.md
├── glasses/         Even Hub app (Vite + TypeScript): G2 screens + the try-it website
│   ├── src/         main.ts (glasses) · page.ts (website) · screens.ts · api.ts
│   ├── public/      logo and icons
│   └── app.json     Even Hub manifest (network whitelist)
├── brand/           logo, Telegram avatar, Discord banner (SVG + PNG)
├── README.md
└── LICENSE          MIT
```

Secrets (`.env`, `.env.gateway`), the live queue (`data.json`), build output and the `.ehpk` package are git-ignored.

## Run it yourself

**You need:** Node 22+ (24 recommended), a Discord bot and/or a Telegram bot, a Claude API key, and the Even Hub simulator (`npm i -g @evenrealities/evenhub-simulator`) or a G2.

### 1. Discord bot
1. https://discord.com/developers/applications → **New Application** → **Bot** → **Reset Token** (copy it).
2. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions *Send Messages*, *Send Messages in Threads*, *Read Message History*, *Use Slash Commands*. Open the URL and add the bot to your server.
3. **General Information** → copy the **Application ID**.

### 1b. Telegram bot (optional)
1. Message [@BotFather](https://t.me/BotFather): `/newbot`, copy the token into `TELEGRAM_BOT_TOKEN`.
2. `/setprivacy` → your bot → **Disable**, so it can read `/stuck` in groups.
3. Students press **Start** in the bot's private chat once, so hints and "on my way" arrive privately (otherwise the bot replies in the group).

### 2. Server
```bash
cd server
cp .env.example .env        # paste DISCORD_TOKEN, DISCORD_APP_ID, TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY
npm install
npm start                   # http://localhost:8787, slash commands register automatically
```
Optional voice notes: build [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (`cmake -B build && cmake --build build --target whisper-cli`), download `ggml-tiny.en.bin`, and set `WHISPER_BIN` and `WHISPER_MODEL` in `.env`. `/health` reports `"voice": true` when it's ready.

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

- **Student data stays small:** display name, seat and the problem text. No email addresses, no phone numbers and no message history. The bots only read messages that start with `/stuck`, `/unstuck` or `/recap`. The glasses never receive Discord or Telegram user IDs.
- **The mentor decides:** Claude only suggests. Nothing reaches the class without a tap on the glasses.
- **Private replies:** hints and "a mentor is on the way" go only to that student (Discord: a private reply or DM; Telegram: a private chat once the student pressed Start, otherwise a reply to their own message).
- **Voice stays on our server:** voice notes are transcribed locally with whisper.cpp, and the audio file is deleted right away.
- **Third parties:** problem text is sent to Claude, through the Anthropic API or the gateway you configure, to shorten and group it. If your school's policy needs it, run with the direct Anthropic API.
- **Keys:** the bot token and API keys live only in `server/.env` on the server and are never in the glasses app or this repo.
- **Not a grading or monitoring tool:** it only shows students who asked for help.

## Built during the hackathon

All code in this repository was written during the build week (Nov 23–29, 2026). We used existing open-source libraries and APIs (discord.js, the Telegram Bot API, the Anthropic SDK, zod, whisper.cpp, Vite, and the Even Hub SDK, CLI and simulator). The idea draws on published research (CMU Lumilo, credited above). No code from it was used.

## Feature requests for Even Hub

1. **Glanceable notification while another app is open:** a one-line "Seat 14 needs help" banner even when Stucklamp isn't in the foreground.
2. **Server push (WebSocket or SSE) allowed in the WebView whitelist**, so apps don't have to poll.
3. **Wildcard or pattern whitelist entries** in `app.json` for self-hosted servers.
4. **Bigger font size per text container**, for one number or name readable at a glance while walking.
5. **Built-in speech-to-text from the SDK**, so a short voice note doesn't need a separate STT service.

## License

MIT
