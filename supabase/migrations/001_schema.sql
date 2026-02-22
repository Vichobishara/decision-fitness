-- Supabase schema: users (extended), decisions, follow_ups, action_plans, subscriptions, payments
-- Run in Supabase SQL Editor or via Supabase CLI.

-- Users (extended from auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'free' check (role in ('free', 'pro')),
  stripe_customer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can read own row"
  on public.users for select using (auth.uid() = id);
create policy "Users can insert own row"
  on public.users for insert with check (auth.uid() = id);
create policy "Users can update own row"
  on public.users for update using (auth.uid() = id);

-- Create user row on signup (sync with auth.users)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'free')
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Decisions
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.decisions enable row level security;

create policy "Users can CRUD own decisions"
  on public.decisions for all using (auth.uid() = user_id);

create index if not exists decisions_user_id on public.decisions(user_id);
create index if not exists decisions_created_at on public.decisions(created_at desc);

-- Follow-ups
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  action_taken text not null,
  regret boolean not null,
  outcome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.follow_ups enable row level security;

create policy "Users can CRUD follow_ups for own decisions"
  on public.follow_ups for all
  using (decision_id in (select id from public.decisions where user_id = auth.uid()));

create index if not exists follow_ups_decision_id on public.follow_ups(decision_id);

-- Action plans
create table if not exists public.action_plans (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(decision_id)
);

alter table public.action_plans enable row level security;

create policy "Users can CRUD action_plans for own decisions"
  on public.action_plans for all
  using (decision_id in (select id from public.decisions where user_id = auth.uid()));

create index if not exists action_plans_decision_id on public.action_plans(decision_id);

-- Subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_subscription text,
  status text not null default 'inactive',
  plan text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscriptions"
  on public.subscriptions for select using (auth.uid() = user_id);

create index if not exists subscriptions_user_id on public.subscriptions(user_id);

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  stripe_invoice_id text,
  amount integer not null,
  currency text not null default 'eur',
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "Users can read payments for own subscriptions"
  on public.payments for select
  using (
    subscription_id in (
      select id from public.subscriptions where user_id = auth.uid()
    )
  );

create index if not exists payments_subscription_id on public.payments(subscription_id);
