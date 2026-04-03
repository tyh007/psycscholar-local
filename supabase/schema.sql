create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paper_count integer not null default 0
);

create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  file_name text not null,
  file_size bigint not null,
  file_type text not null,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz,
  title text,
  authors text,
  year integer,
  journal text,
  doi text,
  abstract text,
  full_text text,
  extracted_data jsonb,
  processing_status text not null default 'pending',
  error_message text,
  in_trash boolean not null default false,
  trashed_at timestamptz
);

create index if not exists papers_project_id_idx on papers(project_id);
create index if not exists papers_project_trash_idx on papers(project_id, in_trash);

create table if not exists custom_fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  prompt text,
  created_at timestamptz not null default now()
);

create index if not exists custom_fields_project_id_idx on custom_fields(project_id);

alter table projects enable row level security;
alter table papers enable row level security;
alter table custom_fields enable row level security;

create policy "users manage own projects" on projects
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "users manage own papers" on papers
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "users manage own custom fields" on custom_fields
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
