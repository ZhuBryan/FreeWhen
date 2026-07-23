# FreeWhen

[![CI](https://github.com/ZhuBryan/FreeWhen/actions/workflows/ci.yml/badge.svg)](https://github.com/ZhuBryan/FreeWhen/actions/workflows/ci.yml)

**Find when your friends are actually free.**

FreeWhen is a small web app for the classic group chat problem: five people,
five class schedules, and somehow no one can name a time that works. Everyone
adds their schedule once. The app overlays them into a weekly heatmap, points
out the best windows, and helps the group actually commit to a plan. No
accounts, no sign ups, just a link you share.

> I built this at the University of Waterloo, so the paste parser understands
> Quest schedules. Calendar import, plain text parsing, and manual entry work
> for any school. Not affiliated with the University of Waterloo.

## How it works

1. **Create a group.** Name it and you get a private shareable link
   (`/g/<slug>`).
2. **Everyone adds their schedule**, using any mix of four input methods:
   - **Paste.** Copy your Quest "My Class Schedule" page straight in and the
     [Quest parser](#how-the-quest-parser-works) turns it into busy blocks,
     capturing each meeting's room and turning single-day sittings (like a
     midterm on one date) into one-off dated blocks instead of weekly ones;
     shared rooms show up in the group's "Same classes" list. If that finds
     nothing, a lenient generic parser (`lib/parseGeneric.ts`) scans for any
     day plus time range lines, like `Work: Mon, Wed 9am - 5pm` or
     `Tuesday and Thursday 14:30-16:00`.
   - **Calendar.** Upload or paste an `.ics` file from Google Calendar,
     Outlook, or Apple Calendar (`lib/parseIcs.ts`). Weekly repeating events
     become recurring blocks (`FREQ=WEEKLY` uses `BYDAY`, daily events fill the
     week, expired `UNTIL` drops the event). One time events become dated
     blocks on their specific day, from 60 days back to a year ahead. All day
     events are skipped.
   - **Manual.** Day toggles and 30 minute time pickers.
   - **Draw.** Drag across a week grid to paint busy time. Dragging over
     painted cells erases. Works with mouse and touch, and touching cells that
     sit next to each other merges them into single blocks.
3. **See what works.** A Monday to Sunday heatmap where greener means more
   people free, plus a ranked list of the best windows, like
   *"Friday · 2:30–5:30 PM"*.

## What it can do

**Adjust the viewing window.** The heatmap shows 8 AM to 10 PM by default, but
you can widen it down to midnight for night owl groups. The choice sticks in
`localStorage` and the window search uses the same range.

**Settle for "at least N of us".** Normally a window only counts when everyone
is free. Groups of three or more get a selector to relax that. A single sweep
per day tracks the running minimum head count, so every window reports how
many people are guaranteed free for the whole span, not just its best half
hour.

**Handle one time events.** The group page shows one week at a time with
back and forward navigation. Recurring blocks apply every week, while dated
one offs (say, an imported dentist appointment) only block the week they fall
in. Asking "who's free next Friday?" accounts for real plans, not just class
patterns.

**Plan events.** The "Plan something" panel scans any date window (7, 14, or
30 days from any start date) for days that fit: pick a time of day, a minimum
duration, and how many people need to make it. Qualifying days show the best
window, who is guaranteed free for all of it, and runner up windows. You can
copy the results as a group chat ready summary, or export any window as an
`.ics` download or Google Calendar link (`lib/calendar.ts`).

**Propose and RSVP.** Any member can turn a candidate window into a proposal,
and everyone else answers yes or no right on the group page. Responders are
identified by their edit token on the server, never by a client supplied id.
The group creator can delete proposals. Proposals ride along in the group
`GET` payload and update over the same live sync channel as everything else.

**Feed your calendar.** The "Calendar feed" button copies a `webcal://` link
to the group's `feed.ics` route. Subscribe in Google or Apple Calendar and the
everyone-free windows for the next four weeks show up as events that update as
people edit their schedules.

**Update live.** Group pages subscribe to a Supabase Realtime broadcast
channel, and the API routes fire a broadcast after every change, so every open
copy of the page refreshes the moment someone saves or removes a schedule. A
small "live" dot shows when the socket is connected. This needs the two
optional `NEXT_PUBLIC_SUPABASE_*` env vars (anon key only, the database is
still only reachable through server side routes). Without them the app falls
back to refetching on focus.

**Respect timezones.** Each schedule is stored with an optional IANA timezone,
defaulting to the browser's detected zone. Every viewer sees all schedules in
their own local time. The conversion is pure TS (`lib/timezone.ts`) and
handles blocks that cross midnight by shifting the weekday and splitting at
the boundary. Members in another zone get a small tag on their chip, and a
null timezone simply means "same as the viewer", so old rows need no backfill.

**Preview nicely in chats.** Group links shared in Discord, iMessage, or Slack
render a per group Open Graph image showing the group's actual heatmap, name,
and head count, generated on request with `next/og`. There is a branded
fallback when the group can't load.

**Let you fix your schedule.** Whoever saved a schedule in a given browser
gets an "Edit my schedule" panel: existing blocks are listed with their labels
intact so you can remove any of them, and new busy time is painted on the drag
grid. Saving sends a PATCH with your edit token.

**Follow you to your phone.** Your edit token lives only in the browser that
saved your schedule, so "Use on my phone" hands your identity to another
device through the share sheet or a copied link. The token travels in the URL
fragment (`#me=id:token`), which never reaches the server or any logs. The
page adopts it, stores it, and scrubs it from the address bar.

**Install like an app.** There's a web app manifest and icons, so you can Add
to Home Screen from the browser and FreeWhen opens standalone. No app store
involved.

There is no login anywhere. A creator token for the group and a per member
edit token are stored in the browser's `localStorage`, and they are the only
way to edit or remove anything. Tokens are never returned by any `GET`
endpoint.

Old groups clean themselves up: every save, edit, or RSVP bumps the group's
`last_active` timestamp, and a daily `pg_cron` job deletes groups idle for
180 days (cascading to their members and proposals). See
`supabase/migrations/2026-07-23-prune-idle-groups.sql`.

## Tech

- Next.js 14 (App Router), TypeScript, Tailwind CSS. No component libraries.
- Supabase (Postgres), accessed only server side from route handlers with the
  service role key. The client is lazily created inside each handler, so
  `next build` passes with no env vars set.
- `nanoid` for slugs (10 chars) and tokens (24 chars). Vitest for unit tests,
  Playwright for e2e (route mocked, no database needed), GitHub Actions for
  CI.
- Write routes are rate limited per IP (sliding window, in memory per
  instance) and return 429 when exceeded.

### Routes

| Method | Path | Body / Header | Returns |
| --- | --- | --- | --- |
| POST | `/api/groups` | `{ name }` | `{ slug, creatorToken }` |
| GET | `/api/groups/[slug]` | none | `{ group, members, proposals }` |
| GET | `/api/groups/[slug]/feed.ics` | none | `text/calendar` feed |
| POST | `/api/groups/[slug]/members` | `{ name, schedule, tz? }` | `{ id, editToken }` |
| POST | `/api/groups/[slug]/proposals` | `{ date, start, end }` + `x-edit-token` | `{ id }` |
| PATCH | `/api/members/[id]` | `{ schedule, tz? }` + `x-edit-token` | `{ ok }` |
| DELETE | `/api/members/[id]` | `x-edit-token` | `{ ok }` |
| PUT | `/api/proposals/[id]` | `{ response }` + `x-edit-token` | `{ ok }` |
| DELETE | `/api/proposals/[id]` | `x-edit-token` (creator) | `{ ok }` |

Schedule blocks are validated server side: `day` 0 to 6, `0 <= start < end <=
1440`, `label` a string, at most 500 blocks, and an optional `date`
(`YYYY-MM-DD`, must be a real date whose weekday matches `day`) for one off
blocks. Member colours come from a fixed 10 colour palette assigned by member
count.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

Other scripts:

```bash
npm run build   # production build (passes with no env vars set)
npm test        # vitest, parser and scheduling unit tests
npm run e2e     # playwright (needs npx playwright install chromium first)
npm run lint    # next lint
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
   `groups`, `members`, `proposals`, and `proposal_rsvps` tables. RLS is
   intentionally off since all access is server side with the service role
   key.
   - Already have the tables from an older version? Run the files in
     [`supabase/migrations/`](supabase/migrations) instead. They add the
     `members.tz` column and the proposals tables.
3. Open **Project Settings, API** and copy:
   - Project URL into `SUPABASE_URL` (and `NEXT_PUBLIC_SUPABASE_URL`)
   - the service_role secret into `SUPABASE_SERVICE_ROLE_KEY`
   - the anon public key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional, this
     is what turns on live sync)
4. Put them in `.env.local`:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# optional, enables live sync
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

> The service role key bypasses row level security. Keep it server side only
> and never prefix it with `NEXT_PUBLIC_`.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel. It auto detects Next.js.
2. Add the environment variables under Settings, Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`, your production URL, used for shareable links
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional,
     for live sync (anon key only, never the service role key)
3. Deploy. Re-deploy after changing env vars.

## How the Quest parser works

`lib/parseQuest.ts` is pure TypeScript with no dependencies. You feed it the
messy text you get from select all plus copy on Quest's **My Class Schedule**
page (tabs, newlines, headers, junk and all) and it returns
`{ courses, blocks, warnings }`.

- Course headers match lines like `CS 350 - Operating Systems`.
- Meeting lines contain a day token followed by a time range, like
  `MWF 10:30AM - 11:20AM`. Day tokens parse longest first (`Th`, `Sa`, `Su`
  before `M`, `T`, `W`, `F`), so `TTh` reads as Tue plus Thu and `MWF` as Mon,
  Wed, Fri. Days map M=0 through Su=6 and times become minutes from midnight.
- The component and section (`LEC`, `TUT`, `LAB`, and so on) can sit on the
  same line or up to two lines earlier, so both the clean tab separated view
  and newline mangled pastes work. Labels come out like `CS 350 LEC`.
- TBA and online rows without times are skipped, duplicate blocks are
  de-duplicated, and lines that look like times but fail to parse end up in
  `warnings` instead of silently disappearing.

Tests live in `lib/__tests__/parseQuest.test.ts` and cover a clean schedule, a
newline mangled version of the same one, and a schedule with TBA and online
rows.

## Using it at another university

Only the Quest parser is UW specific. The `.ics` import, the generic text
parser, manual entry, drawing, and all of the overlap math are school
agnostic. Each importer is a standalone pure TS module in `lib/` returning the
same `Block[]` shape, so supporting another registrar means adding one parser
file and one tab in the add schedule flow.
