-- Create table for storing agent chains
create table if not exists public.agent_chains (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users not null,
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.agent_chains enable row level security;

-- Allow users to manage their own agent chains
create policy "Users can manage their own agent chains" on public.agent_chains
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
