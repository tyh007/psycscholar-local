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

alter table projects add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table projects add column if not exists description text;
alter table projects add column if not exists created_at timestamptz not null default now();
alter table projects add column if not exists updated_at timestamptz not null default now();
alter table projects add column if not exists paper_count integer not null default 0;

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

alter table papers add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table papers add column if not exists project_id uuid references projects(id) on delete cascade;
alter table papers add column if not exists file_name text;
alter table papers add column if not exists file_size bigint;
alter table papers add column if not exists file_type text;
alter table papers add column if not exists uploaded_at timestamptz not null default now();
alter table papers add column if not exists processed_at timestamptz;
alter table papers add column if not exists title text;
alter table papers add column if not exists authors text;
alter table papers add column if not exists year integer;
alter table papers add column if not exists journal text;
alter table papers add column if not exists doi text;
alter table papers add column if not exists abstract text;
alter table papers add column if not exists full_text text;
alter table papers add column if not exists extracted_data jsonb;
alter table papers add column if not exists processing_status text not null default 'pending';
alter table papers add column if not exists error_message text;
alter table papers add column if not exists in_trash boolean not null default false;
alter table papers add column if not exists trashed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'papers'
      and column_name = 'authors'
      and udt_name <> 'text'
  ) then
    alter table papers
      alter column authors type text
      using case
        when authors is null then null
        else array_to_string(authors, '; ')
      end;
  end if;
end $$;

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

alter table custom_fields add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table custom_fields add column if not exists project_id uuid references projects(id) on delete cascade;
alter table custom_fields add column if not exists name text;
alter table custom_fields add column if not exists description text;
alter table custom_fields add column if not exists prompt text;
alter table custom_fields add column if not exists created_at timestamptz not null default now();

create index if not exists custom_fields_project_id_idx on custom_fields(project_id);

alter table projects enable row level security;
alter table papers enable row level security;
alter table custom_fields enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'projects' and policyname = 'users manage own projects'
  ) then
    create policy "users manage own projects" on projects
    for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'papers' and policyname = 'users manage own papers'
  ) then
    create policy "users manage own papers" on papers
    for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'custom_fields' and policyname = 'users manage own custom fields'
  ) then
    create policy "users manage own custom fields" on custom_fields
    for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
  end if;
end $$;
