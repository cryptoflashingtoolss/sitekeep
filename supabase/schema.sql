-- =====================================================================
-- SiteKeep database schema
-- Run this ONCE in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Security model: Supabase only ever stores ENCRYPTED blobs.
-- Site data, credentials, tasks and settings are encrypted on the device
-- before upload. Supabase never sees your master password either: the app
-- derives a separate login key from it.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  display_name    text,
  public_key      text not null,          -- used by teammates to share site keys with you
  enc_private_key text not null,          -- your private key, encrypted with your master password
  enc_settings    text,                   -- your app settings (incl. AI key), encrypted
  created_at      timestamptz not null default now()
);

create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  data        text not null,              -- encrypted site record (name, url, credentials, checklist...)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.site_members (
  site_id     uuid not null references public.sites(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('owner', 'editor', 'viewer')),
  sealed_key  text not null,              -- the site key, encrypted to this member's public key
  added_at    timestamptz not null default now(),
  primary key (site_id, user_id)
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  data        text not null,              -- encrypted task (title, due date, done...)
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.site_members add column if not exists stale boolean not null default false;

create index if not exists site_members_user_idx on public.site_members(user_id);
create index if not exists tasks_site_idx on public.tasks(site_id);

-- ---------- updated_at triggers ----------------------------------------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists sites_touch on public.sites;
create trigger sites_touch before update on public.sites
  for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------- Helper functions (security definer avoids RLS recursion) ---

create or replace function public.site_role(p_site uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from site_members where site_id = p_site and user_id = auth.uid() and not coalesce(stale, false)
$$;

create or replace function public.owns_site(p_site uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sites where id = p_site and owner_id = auth.uid())
$$;

create or replace function public.shares_site_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from site_members a
    join site_members b on a.site_id = b.site_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

-- Look up a teammate by email so you can share a site with them.
-- Returns only their public key and name, never anything secret.
create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, email text, display_name text, public_key text)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.display_name, p.public_key
  from profiles p
  where auth.uid() is not null
    and lower(p.email) = lower(trim(p_email))
$$;

-- Re-encrypt a site with a new key after removing a member, all in one
-- transaction so the site can never end up half-rotated.
create or replace function public.rotate_site_key(
  p_site uuid, p_data text, p_tasks jsonb, p_keys jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  t jsonb;
begin
  if not owns_site(p_site) then
    raise exception 'Only the site owner can rotate its key';
  end if;

  if exists (
    select 1 from tasks
    where site_id = p_site
      and id not in (select (x->>'id')::uuid from jsonb_array_elements(p_tasks) x)
  ) then
    raise exception 'Tasks changed while rotating the key. Please try again.';
  end if;

  if exists (
    select 1 from site_members
    where site_id = p_site
      and user_id not in (select (x->>'user_id')::uuid from jsonb_array_elements(p_keys) x)
  ) then
    raise exception 'Members changed while rotating the key. Please try again.';
  end if;

  update sites set data = p_data where id = p_site;

  for t in select * from jsonb_array_elements(p_tasks) loop
    update tasks set data = t->>'data'
    where id = (t->>'id')::uuid and site_id = p_site;
  end loop;

  for t in select * from jsonb_array_elements(p_keys) loop
    update site_members set sealed_key = t->>'sealed_key'
    where site_id = p_site and user_id = (t->>'user_id')::uuid;
  end loop;
end $$;

revoke execute on function public.site_role(uuid) from anon, public;
revoke execute on function public.owns_site(uuid) from anon, public;
revoke execute on function public.shares_site_with(uuid) from anon, public;
revoke execute on function public.find_profile_by_email(text) from anon, public;
revoke execute on function public.rotate_site_key(uuid, text, jsonb, jsonb) from anon, public;
grant execute on function public.site_role(uuid) to authenticated;
grant execute on function public.owns_site(uuid) to authenticated;
grant execute on function public.shares_site_with(uuid) to authenticated;
grant execute on function public.find_profile_by_email(text) to authenticated;
grant execute on function public.rotate_site_key(uuid, text, jsonb, jsonb) to authenticated;

-- ---------- Team admin, invitations, recovery ----------------------------

alter table public.profiles add column if not exists enc_private_key_recovery text; -- private key locked with the recovery key
alter table public.profiles add column if not exists vault_reset_at timestamptz;     -- set when someone starts a fresh vault
alter table public.site_members add column if not exists stale boolean not null default false; -- member reset their vault; needs access restored

create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now()
);

create table if not exists public.invites (
  email      text primary key,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;

-- Only invited emails can create a profile. The very first person is let in and becomes admin.
create or replace function public.can_join(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles)
      or exists (select 1 from invites where lower(email) = lower(trim(p_email)))
$$;

create or replace function public.after_profile_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from profiles) = 1 then
    insert into app_admins (user_id) values (new.id) on conflict do nothing;
  end if;
  delete from invites where lower(email) = lower(new.email);
  return new;
end $$;
drop trigger if exists profiles_after_insert on public.profiles;
create trigger profiles_after_insert after insert on public.profiles
  for each row execute function public.after_profile_created();

-- Never allow removing the last admin.
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from app_admins) = 0 then
    raise exception 'SiteKeep needs at least one admin';
  end if;
  return null;
end $$;
drop trigger if exists app_admins_keep_one on public.app_admins;
create constraint trigger app_admins_keep_one after delete on public.app_admins
  deferrable initially immediate for each row execute function public.keep_one_admin();

-- Forgot password and no recovery key: start over with new keys.
-- Old memberships are flagged so a teammate can restore access after checking it's really them.
create or replace function public.start_fresh_vault(p_public_key text, p_enc_private_key text, p_enc_settings text, p_enc_private_key_recovery text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update profiles set public_key = p_public_key, enc_private_key = p_enc_private_key,
    enc_settings = p_enc_settings, enc_private_key_recovery = p_enc_private_key_recovery, vault_reset_at = now()
  where id = auth.uid();
  update site_members set stale = true where user_id = auth.uid();
end $$;

-- An owner or editor (who holds the site key) restores a reset teammate's access.
create or replace function public.restore_member(p_site uuid, p_user uuid, p_sealed_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user = auth.uid() then raise exception 'Ask a teammate to restore your access'; end if;
  if coalesce(site_role(p_site), 'none') not in ('owner', 'editor') then
    raise exception 'Only owners and editors can restore access';
  end if;
  update site_members set sealed_key = p_sealed_key, stale = false
  where site_id = p_site and user_id = p_user and stale;
  if not found then raise exception 'That person is not waiting for access to this site'; end if;
end $$;

-- Admin overview of the whole team. Counts only, nothing secret.
create or replace function public.team_overview()
returns table (id uuid, email text, display_name text, is_admin boolean, joined timestamptz, sites int, waiting int, vault_reset_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.display_name,
         exists (select 1 from app_admins a where a.user_id = p.id),
         p.created_at,
         (select count(*)::int from site_members m where m.user_id = p.id and not m.stale),
         (select count(*)::int from site_members m where m.user_id = p.id and m.stale),
         p.vault_reset_at
  from profiles p
  where public.is_admin()
  order by p.created_at
$$;

revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.can_join(text) from anon, public;
revoke execute on function public.start_fresh_vault(text, text, text, text) from anon, public;
revoke execute on function public.restore_member(uuid, uuid, text) from anon, public;
revoke execute on function public.team_overview() from anon, public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_join(text) to authenticated;
grant execute on function public.start_fresh_vault(text, text, text, text) to authenticated;
grant execute on function public.restore_member(uuid, uuid, text) to authenticated;
grant execute on function public.team_overview() to authenticated;

alter table public.app_admins enable row level security;
alter table public.invites    enable row level security;

drop policy if exists admins_select on public.app_admins;
create policy admins_select on public.app_admins for select to authenticated using (true);
drop policy if exists admins_insert on public.app_admins;
create policy admins_insert on public.app_admins for insert to authenticated
  with check (public.is_admin() and exists (select 1 from public.profiles p where p.id = user_id));
drop policy if exists admins_delete on public.app_admins;
create policy admins_delete on public.app_admins for delete to authenticated using (public.is_admin());

drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Row Level Security -----------------------------------------

alter table public.profiles     enable row level security;
alter table public.sites        enable row level security;
alter table public.site_members enable row level security;
alter table public.tasks        enable row level security;

-- profiles: you see yourself and people you share a site with
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_site_with(id) or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (
    id = auth.uid()
    and lower(email) = lower(auth.jwt() ->> 'email')
    and public.can_join(email)
  );
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- sites: members read; owner/editor write; only owner deletes
drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites for select to authenticated
  using (public.site_role(id) is not null);
drop policy if exists sites_insert on public.sites;
create policy sites_insert on public.sites for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists sites_update on public.sites;
create policy sites_update on public.sites for update to authenticated
  using (public.site_role(id) in ('owner', 'editor'))
  with check (public.site_role(id) in ('owner', 'editor'));
drop policy if exists sites_delete on public.sites;
create policy sites_delete on public.sites for delete to authenticated
  using (owner_id = auth.uid());

-- site_members: members see the member list; only the owner adds/changes;
-- the owner can only add themselves as 'owner', others as editor/viewer
drop policy if exists members_select on public.site_members;
create policy members_select on public.site_members for select to authenticated
  using (public.site_role(site_id) is not null or user_id = auth.uid());
drop policy if exists members_insert on public.site_members;
create policy members_insert on public.site_members for insert to authenticated
  with check (public.owns_site(site_id) and ((user_id = auth.uid()) = (role = 'owner')));
drop policy if exists members_update on public.site_members;
create policy members_update on public.site_members for update to authenticated
  using (public.owns_site(site_id))
  with check (public.owns_site(site_id) and ((user_id = auth.uid()) = (role = 'owner')));
drop policy if exists members_delete on public.site_members;
create policy members_delete on public.site_members for delete to authenticated
  using (public.owns_site(site_id) or user_id = auth.uid());

-- tasks: members read; owner/editor write
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.site_role(site_id) is not null);
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.site_role(site_id) in ('owner', 'editor') and created_by = auth.uid());
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.site_role(site_id) in ('owner', 'editor'))
  with check (public.site_role(site_id) in ('owner', 'editor'));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.site_role(site_id) in ('owner', 'editor'));
