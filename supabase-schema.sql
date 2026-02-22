-- Run this in Supabase SQL Editor to create tables and RLS.

-- Profiles (extends auth.users, store role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'free' check (role in ('free', 'pro')),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'free');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Decisions
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_text text not null,
  objective text,
  alternatives jsonb,
  evidence_for text,
  evidence_missing text,
  cost_level text,
  reversibility text,
  emotional_state text,
  score integer not null,
  recommendation text not null,
  reason_text text not null,
  decision_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.decisions enable row level security;

create policy "Users can CRUD own decisions"
  on public.decisions for all
  using (auth.uid() = user_id);

create index decisions_user_id on public.decisions(user_id);
create index decisions_created_at on public.decisions(created_at desc);

-- Follow-ups
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  action_taken text not null,
  regret boolean not null,
  outcome text not null,
  created_at timestamptz default now()
);

alter table public.follow_ups enable row level security;

create policy "Users can CRUD follow_ups for own decisions"
  on public.follow_ups for all
  using (
    decision_id in (select id from public.decisions where user_id = auth.uid())
  );

create index follow_ups_decision_id on public.follow_ups(decision_id);

-- Action plans
create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  items jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(decision_id)
);

alter table public.action_plans enable row level security;

create policy "Users can CRUD action_plans for own decisions"
  on public.action_plans for all
  using (
    decision_id in (select id from public.decisions where user_id = auth.uid())
  );

create index action_plans_decision_id on public.action_plans(decision_id);
