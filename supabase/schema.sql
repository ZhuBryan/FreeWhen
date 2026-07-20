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
  created_at    timestamptz not null default now()
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

create index if not exists members_group_id_idx on members(group_id);
create index if not exists groups_slug_idx on groups(slug);

-- schedule jsonb shape: array of blocks
--   { "day": 0..6 (0=Mon), "start": minutes-from-midnight, "end": minutes, "label": "CS 350 LEC" }
-- Optional "date": "YYYY-MM-DD" marks a one-off block on that specific date
-- (weekday must match "day"); blocks without "date" repeat weekly.
