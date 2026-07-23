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
create index if not exists proposals_group_id_idx on proposals(group_id);
