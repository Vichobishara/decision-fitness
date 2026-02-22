-- Add pro_since to public.users (nullable; set when user becomes Pro).
alter table public.users
  add column if not exists pro_since timestamptz;
