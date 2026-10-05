-- 於 Supabase SQL Editor 以專案擁有者身分執行。先建立 Auth 使用者，再將其 UUID 插入 kitchen_members。
create schema if not exists private;

create table if not exists public.kitchen_catalog (
  id integer primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  players jsonb not null default '[]'::jsonb check (jsonb_typeof(players) = 'array'),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  updated_at timestamptz not null default now()
);
insert into public.kitchen_catalog (id) values (1) on conflict (id) do nothing;

create table if not exists public.kitchen_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false
);

create or replace function private.is_kitchen_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.kitchen_members where user_id = (select auth.uid()));
$$;
create or replace function private.is_kitchen_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.kitchen_members where user_id = (select auth.uid()) and is_admin);
$$;
revoke all on function private.is_kitchen_member() from public, anon;
revoke all on function private.is_kitchen_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_kitchen_member() to authenticated;
grant execute on function private.is_kitchen_admin() to authenticated;

alter table public.kitchen_catalog enable row level security;
alter table public.kitchen_members enable row level security;
revoke all on public.kitchen_catalog, public.kitchen_members from anon, authenticated;
grant select, update on public.kitchen_catalog to authenticated;
grant select on public.kitchen_members to authenticated;

drop policy if exists kitchen_catalog_read on public.kitchen_catalog;
create policy kitchen_catalog_read on public.kitchen_catalog for select to authenticated
  using ((select private.is_kitchen_member()));
drop policy if exists kitchen_catalog_admin_update on public.kitchen_catalog;
create policy kitchen_catalog_admin_update on public.kitchen_catalog for update to authenticated
  using ((select private.is_kitchen_admin()))
  with check ((select private.is_kitchen_admin()));
drop policy if exists kitchen_members_self_read on public.kitchen_members;
create policy kitchen_members_self_read on public.kitchen_members for select to authenticated
  using (user_id = (select auth.uid()));

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kitchen_catalog'
  ) then
    alter publication supabase_realtime add table public.kitchen_catalog;
  end if;
end $$;

-- 在 Auth > Users 建立帳號，複製 UUID，再執行：
-- insert into public.kitchen_members (user_id, is_admin) values ('管理者的-UUID', true);
-- insert into public.kitchen_members (user_id, is_admin) values ('一般使用者的-UUID', false);
