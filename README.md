# FreeWhen

**Find when your friends are actually free.** A tiny schedule-overlap web app
for student friend groups. Everyone pastes their class schedule once; FreeWhen
overlaps them into a weekly heatmap and lists the best times when the group is
free — no accounts, no back-and-forth texting.

> Built at the University of Waterloo (the schedule parser understands UW
> Quest), but calendar import, plain-text parsing, and manual entry work for
> any school · not affiliated with the University of Waterloo.

## How it works

1. **Create a group** — name it, get a private shareable link (`/g/<slug>`).
2. **Everyone adds their schedule** — three input methods, freely combined
   before saving:
   - **Paste schedule** — paste raw Quest "My Class Schedule" text; the
     [Quest parser](#how-the-quest-parser-works) turns it into busy blocks. If
     the Quest parser finds nothing, a lenient generic parser
     (`lib/parseGeneric.ts`) scans the text for any day + time-range lines
     (e.g. `Work: Mon, Wed 9am - 5pm`, `Tuesday and Thursday 14:30-16:00`).
   - **Import calendar** — upload or paste an `.ics` file exported from Google
     Calendar, Outlook, or Apple Calendar (`lib/parseIcs.ts`). Repeating events
     become weekly blocks: `FREQ=WEEKLY` uses `BYDAY` codes (or the `DTSTART`
     weekday when absent), `FREQ=DAILY` fills all seven days, and a `UNTIL` in
     the past drops the event. One-time events become **dated blocks** on their
     specific date, imported from 60 days back to 365 days ahead (events outside
     that window are skipped with a warning). Event times are read as literal
     wall-clock times; all-day events are skipped.
   - **Enter manually** — add busy times by hand with day toggles + 30-min time
     pickers.
3. **See the overlap** — a Mon–Sun heatmap (green = more people free) plus the
   top free windows, e.g. *"Friday · 2:30–5:30 PM"*.

**Viewing window.** The heatmap defaults to 8 AM–10 PM but the hours are
adjustable per group (down to midnight for night owls); the choice is
remembered in `localStorage`. Free-window search runs over the same window.

**"At least N of us."** By default the best-times list only counts windows
where *everyone* is free. With 3+ members a selector relaxes that to "at least
N of M" — a single sweep per day tracks the running minimum head-count, so
each window reports the number of people *guaranteed* free for its whole
span, not just its best half-hour.

**Week navigation & one-time events.** The group page shows one specific week
at a time (defaulting to the current week) with ‹ › navigation and a "Today"
reset. Weekly-recurring blocks apply to every week; dated one-off blocks
(e.g. an imported dentist appointment) only make someone busy in the week they
actually fall in — so "who's free next Friday?" accounts for one-time plans,
not just class patterns.

**Event planner.** "Plan something" scans an arbitrary date window (from any
start date, 7/14/30 days ahead) for days that fit an event: pick a time of day
(mornings / afternoons / evenings / any), a minimum duration, and how many
people need to make it. Each date is evaluated against its own effective
blocks (recurring + that day's one-offs), and qualifying days list the best
window, who's guaranteed free for all of it, and runner-up windows. Results
can be copied as a group-chat-ready summary or exported per window as an
`.ics` download / Google Calendar link (`lib/calendar.ts`, floating local
times per RFC 5545).

**Live sync.** Group pages subscribe to a Supabase Realtime broadcast channel
(`group:<slug>`); after every mutation the API routes fire a broadcast over
Realtime's REST endpoint, so every open copy of the page refreshes the moment
anyone saves or removes a schedule — a "live" indicator shows when the socket
is connected. Requires the two optional `NEXT_PUBLIC_SUPABASE_*` env vars
(anon key only; the database is still reachable exclusively through
server-side routes). Without them the app degrades to refetch-on-focus.

No login. A creator token (for the group) and a per-member edit token are stored
in the browser's `localStorage`; they are the only way to remove members. Tokens
are **never** returned by any `GET` endpoint.

## Tech

- Next.js 14 (App Router) + TypeScript + Tailwind CSS — no component libraries.
- Supabase (Postgres) accessed **only** server-side from route handlers using the
  service role key. The client is lazy-initialised inside each handler, so
  `next build` succeeds with no environment variables set.
- `nanoid` for slugs (10 chars) and tokens (24 chars). Vitest for parser tests.

### Routes

| Method | Path | Body / Header | Returns |
| --- | --- | --- | --- |
| POST | `/api/groups` | `{ name }` | `{ slug, creatorToken }` |
| GET | `/api/groups/[slug]` | — | `{ group, members(id,name,color,schedule) }` |
| POST | `/api/groups/[slug]/members` | `{ name, schedule }` | `{ id, editToken }` |
| DELETE | `/api/members/[id]` | header `x-edit-token` | `{ ok }` |

Schedule blocks are validated server-side: `day` 0–6, `0 ≤ start < end ≤ 1440`,
`label` a string, max 500 blocks, and an optional `date` (`YYYY-MM-DD`, must be
a real date whose weekday matches `day`) marking a one-off block. Member colours
come from a fixed 10-colour palette, assigned by member count.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

Other scripts:

```bash
npm run build   # production build (passes with no env vars set)
npm test        # vitest — parser tests
npm run lint     # next lint
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and **Run** it. This creates the
   `groups` and `members` tables. (RLS is intentionally left off — all access is
   server-side with the service role key.)
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL` (and `NEXT_PUBLIC_SUPABASE_URL`)
   - **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional — live sync)
4. Put them in `.env.local`:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# optional — enables live sync
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

> ⚠️ The service role key bypasses row-level security. Keep it server-side only —
> never prefix it with `NEXT_PUBLIC_`.

## Deploy to Vercel

1. Push this repo to GitHub and **Import** it in Vercel (framework auto-detects
   as Next.js).
2. Add the environment variables under **Settings → Environment Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` → your production URL, e.g. `https://freewhen.vercel.app`
     (used to build shareable links).
   - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` → optional,
     enables live sync (anon key only — never the service role key).
3. Deploy. Re-deploy after changing env vars.

## How the Quest parser works

`lib/parseQuest.ts` is pure TypeScript with no dependencies. It takes the messy
text you get from selecting all and copying Quest's **My Class Schedule** (list
view) — tabs, newlines, headers, and junk — and returns
`{ courses, blocks, warnings }`.

- **Course headers** match `CS 350 - Operating Systems`
  (`/^([A-Z]{2,6})\s*(\d{2,4}[A-Z]?)\s*-\s*(.+)$/`).
- **Meeting lines** contain a day token followed by a time range like
  `MWF 10:30AM - 11:20AM`. Day tokens are parsed **longest-first**
  (`Th`, `Sa`, `Su` before `M`, `T`, `W`, `F`), so `TTh` → Tue + Thu and
  `MWF` → Mon + Wed + Fri. Days map `M=0 … Su=6`; times become minutes from
  midnight (`12 PM = 720`, `12 AM = 0`).
- **Component + section** (`LEC`/`TUT`/`LAB`/`SEM`/`PRJ`/`TST`/`STU`) are found on
  the same line or up to two preceding non-empty lines, so both the clean
  tab-separated view and newline-mangled pastes work. Block labels look like
  `CS 350 LEC` (falling back to the course code, then `"Class"`).
- **TBA** and online rows without times are skipped; identical blocks are
  de-duplicated; start/end dates are ignored. Lines that look like times but
  fail to parse (or where end ≤ start) are surfaced in `warnings`.

Tests live in `lib/__tests__/parseQuest.test.ts` and cover a clean tab-separated
schedule, a newline-mangled version of it, and a schedule with TBA/online rows.

## Using it at another university

Only the Quest parser is UW-specific. Everything else — `.ics` import, the
generic day+time text parser, manual entry, and all of the overlap math — is
school-agnostic. Each importer is a standalone pure-TS module in `lib/`
(`parseQuest.ts`, `parseIcs.ts`, `parseGeneric.ts`) returning the same
`Block[]` shape, so supporting another registrar's schedule format means
adding one parser file and one tab in `AddScheduleFlow`.
