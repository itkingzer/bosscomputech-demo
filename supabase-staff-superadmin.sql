begin;
set local role postgres;

-- Promote the existing bootstrap owner only when it is unambiguous.
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"boss_superadmin":true}'::jsonb
where raw_app_meta_data ->> 'boss_role' = 'admin'
  and (select count(*) from auth.users where raw_app_meta_data ->> 'boss_role' = 'admin') = 1
  and not exists (select from auth.users where raw_app_meta_data ->> 'boss_superadmin' = 'true');

create or replace function boss_private.is_staff_superadmin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select from auth.users
    where id = (select auth.uid()) and raw_app_meta_data ->> 'boss_superadmin' = 'true'
  );
$$;
revoke all on function boss_private.is_staff_superadmin() from public, anon;
grant execute on function boss_private.is_staff_superadmin() to authenticated;

create or replace function public.boss_staff_profile()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select p || pg_catalog.jsonb_build_object('is_superadmin', boss_private.is_staff_superadmin())
  from (select boss_private.staff_profile() as p) as profile;
$$;

-- Account lifecycle goes through the Edge Function. Keep profile-field edits available.
revoke insert, delete, update on public.users from authenticated;
revoke insert (id, username, name, nickname, role, assigned_route, is_active, department, phone,
  email, address, badge, avatar, profile_details, employment_start_date, work_positions, auth_invite_pending)
  on public.users from authenticated;
revoke update (username, role, is_active, email, work_positions, auth_invite_pending)
  on public.users from authenticated;

create or replace function boss_private.delete_staff_account(actor_id uuid, target_id text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  account_id uuid;
begin
  if not exists (
    select from auth.users a
    left join public.users u on u.auth_user_id = a.id
    where a.id = actor_id and a.raw_app_meta_data ->> 'boss_superadmin' = 'true'
      and ((u.id is null and a.raw_app_meta_data ->> 'boss_role' = 'admin')
        or (u.is_active and u.role = 'admin'))
  ) then
    raise exception 'Superadmin access required' using errcode = '42501';
  end if;

  select auth_user_id into account_id from public.users where id = target_id for update;
  if not found then return false; end if;
  if account_id = actor_id or target_id = actor_id::text then
    raise exception 'Cannot delete your own account' using errcode = '42501';
  end if;

  delete from public.users where id = target_id;
  if account_id is not null then
    delete from auth.users where id = account_id;
  end if;
  return true;
end;
$$;

create or replace function public.boss_delete_staff_account(actor_id uuid, target_id text)
returns boolean language sql security invoker set search_path = ''
as $$ select boss_private.delete_staff_account(actor_id, target_id); $$;
revoke all on function boss_private.delete_staff_account(uuid, text), public.boss_delete_staff_account(uuid, text)
  from public, anon, authenticated;
grant execute on function boss_private.delete_staff_account(uuid, text), public.boss_delete_staff_account(uuid, text)
  to service_role;

commit;
