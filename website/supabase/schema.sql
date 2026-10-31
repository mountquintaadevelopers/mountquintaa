-- Mount Quintaa — Supabase setup
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates what is missing.

-- Enquiries from the website form
create table if not exists public.leads (
  id         bigint generated always as identity primary key,
  name       text not null,
  email      text default '',
  phone      text not null,
  message    text default '',
  source     text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_leads_created on public.leads (created_at);

-- Blog posts managed from the admin panel
create table if not exists public.blogs (
  id         bigint generated always as identity primary key,
  title      text not null,
  slug       text not null unique,
  excerpt    text default '',
  content    text not null,
  cover_url  text default '',
  status     text not null default 'published' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_blogs_created on public.blogs (created_at);

-- Lock both tables: with RLS on and no policies, nobody can read or write them
-- with the public (anon) key. Only the website server, using the service-role
-- key, can - so visitors can't read other people's enquiries.
alter table public.leads enable row level security;
alter table public.blogs enable row level security;

-- Let the server's secret (service_role) key use the tables. Newer Supabase
-- projects don't grant this automatically for tables created in SQL.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.leads, public.blogs to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Public bucket for blog cover images (uploaded from the admin panel)
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;
