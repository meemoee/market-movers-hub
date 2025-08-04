create table if not exists agent_chains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  chain jsonb not null,
  created_at timestamptz default now()
);
