-- Demo leads: store email + decision result when user submits "Enviar resultados" in Modo demo.
-- No email sending yet; just storage for follow-up.
--
-- Full table definition (for reference in code):
-- create table public.leads (
--   id uuid default gen_random_uuid() primary key,
--   email text not null,
--   decision_text text,
--   score int,
--   recommendation text,
--   reason_text text,
--   created_at timestamptz default now()
-- );

create table if not exists public.leads (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  decision_text text,
  score int,
  recommendation text,
  reason_text text,
  created_at timestamptz default now()
);

alter table public.leads enable row level security;

-- Allow anonymous insert only (no read for anon; use service role to read).
create policy "Allow anonymous insert to leads"
  on public.leads for insert to anon with check (true);
