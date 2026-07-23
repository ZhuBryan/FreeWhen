-- Groups that nobody has touched in 180 days get deleted by a daily job.
-- last_active is bumped by the API on every mutation (member saves, edits,
-- removals, proposals, RSVPs). Deleting a group cascades to its members,
-- proposals, and RSVPs through their foreign keys.

alter table groups add column if not exists last_active timestamptz not null default now();

create extension if not exists pg_cron;

-- Re-running this replaces the existing job of the same name.
select cron.schedule(
  'freewhen-prune-idle-groups',
  '15 5 * * *',
  $$delete from groups where last_active < now() - interval '180 days'$$
);
