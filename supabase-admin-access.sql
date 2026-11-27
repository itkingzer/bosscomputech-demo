-- Run after schema.sql. This migration grants online access to app administrators.
-- In Authentication > Users, copy the first administrator's User UID.
-- As postgres, run this separately with that UID in place of the placeholder:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"boss_role":"admin"}'::jsonb
-- where id = 'REPLACE_WITH_AUTH_USER_UID'::uuid;
-- The administrator must sign in again after changing their app metadata.

begin;

-- SQL Editor can connect as postgres while impersonating an application role.
-- Use the connected owner role for this transaction only.
set local role postgres;

grant usage on schema public to authenticated;

do $$
declare
  table_name text;
  admin_check constant text :=
    '(select (auth.jwt() -> ''app_metadata'' ->> ''boss_role'') = ''admin'')';
begin
  if current_user <> 'postgres' then
    raise exception 'Run this migration as postgres (current_user=%, session_user=%)',
      current_user, session_user;
  end if;

  foreach table_name in array array[
    'orders', 'items', 'repair_tickets', 'products', 'stock_pos',
    'projects', 'users', 'contracts', 'contract_items'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    execute format('drop policy if exists boss_admin_guard on public.%I', table_name);
    execute format('drop policy if exists boss_admin_access on public.%I', table_name);
    execute format(
      'create policy boss_admin_guard on public.%I as restrictive for all to public using (%s) with check (%s)',
      table_name, admin_check, admin_check
    );
    execute format(
      'create policy boss_admin_access on public.%I for all to authenticated using (%s) with check (%s)',
      table_name, admin_check, admin_check
    );
    if table_name <> 'users' then
      execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    end if;
  end loop;
end
$$;

-- Remove the earlier connection probe grant and protect the legacy password column.
revoke select (id) on public.orders from public, anon;
revoke select (password), insert (password), update (password)
  on public.users from public, anon, authenticated;
grant select (
  id, username, name, nickname, role, assigned_route, is_active, created_at, updated_at,
  department, phone, email, address, badge, avatar, profile_details,
  employment_start_date, work_positions
) on public.users to authenticated;
grant insert (
  id, username, name, nickname, role, assigned_route, is_active, department, phone,
  email, address, badge, avatar, profile_details, employment_start_date, work_positions
) on public.users to authenticated;
grant update (
  username, name, nickname, role, assigned_route, is_active, department, phone,
  email, address, badge, avatar, profile_details, employment_start_date, work_positions
) on public.users to authenticated;
grant delete on public.users to authenticated;

revoke execute on function public.release_project_stock(text, timestamptz, jsonb, jsonb, uuid[])
  from public, anon;
revoke execute on function public.finish_project_stock_prep(text, timestamptz, jsonb, jsonb)
  from public, anon;
revoke execute on function public.finish_project_handover(text, timestamptz, jsonb)
  from public, anon;
grant execute on function public.release_project_stock(text, timestamptz, jsonb, jsonb, uuid[])
  to authenticated;
grant execute on function public.finish_project_stock_prep(text, timestamptz, jsonb, jsonb)
  to authenticated;
grant execute on function public.finish_project_handover(text, timestamptz, jsonb)
  to authenticated;

commit;
