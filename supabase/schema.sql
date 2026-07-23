-- FreeWhen schema
-- Paste this into the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- All access happens server-side with the service role key, so RLS is left off.
-- (If you later add client access, enable RLS and write policies first.)

create extension if not exists "pgcrypto";

create table if not exists groups (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  creator_token text not null,
  created_at    timestamptz not null default now(),
  -- bumped by the API on every mutation; the daily prune job removes groups
  -- idle for 180 days (see migrations/2026-07-23-prune-idle-groups.sql)
  last_active   timestamptz not null default now()
);

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id) on delete cascade,
  name        text not null,
  color       text not null,
  edit_token  text not null,
  schedule    jsonb not null default '[]'::jsonb,
  tz          text, -- null means "same timezone as the viewer / no conversion"
  created_at  timestamptz not null default now()
);

-- No secondary indexes on purpose: these tables stay tiny, sequential scans
-- are free at this size, and fewer indexes means fewer things to corrupt.
-- (groups.slug already has an index via its unique constraint.)

-- schedule jsonb shape: array of blocks
--   { "day": 0..6 (0=Mon), "start": minutes-from-midnight, "end": minutes, "label": "CS 350 LEC" }
-- Optional "date": "YYYY-MM-DD" marks a one-off block on that specific date
-- (weekday must match "day"); blocks without "date" repeat weekly.

-- Event proposals: a concrete date + time window someone floats to the group,
-- and each member's yes/no RSVP.
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  date text not null,
  start_min int not null,
  end_min int not null,
  created_at timestamptz not null default now()
);
create table if not exists proposal_rsvps (
  proposal_id uuid not null references proposals(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  response text not null check (response in ('yes','no')),
  created_at timestamptz not null default now(),
  primary key (proposal_id, member_id)
);
