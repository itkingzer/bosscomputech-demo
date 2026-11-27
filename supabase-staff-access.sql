-- Run once schema.sql and supabase-admin-access.sql are installed. Safe to run again.
begin;
set local role postgres;

alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists auth_invite_pending boolean not null default false;

create unique index if not exists boss_users_auth_uid on public.users (auth_user_id);
create unique index if not exists boss_users_online_email on public.users (lower(email))
  where auth_user_id is not null or auth_invite_pending;

create schema if not exists boss_private;
revoke all on schema boss_private from public, anon;
grant usage on schema boss_private to authenticated;

-- Resolve access from the current directory row on each database request.
-- Existing owners tagged by the bootstrap script can sign in before being linked.
create or replace function boss_private.staff_profile()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when u.id is not null then
      case when u.is_active and u.role = any (array[
        'admin','sales','accounting','finance','prep','frontdesk','onsite','repair','hr'
      ]) then pg_catalog.jsonb_build_object(
        'id', u.id, 'auth_user_id', a.id, 'username', u.username, 'name', u.name,
        'email', a.email, 'role', u.role, 'assigned_route', u.assigned_route,
        'phone', u.phone, 'address', u.address, 'avatar', u.avatar,
        'profile_details', u.profile_details, 'department', u.department,
        'nickname', u.nickname, 'employment_start_date', u.employment_start_date,
        'work_positions', coalesce(u.work_positions, array[]::text[])
      ) end
    when a.raw_app_meta_data ->> 'boss_role' = 'admin' then
      pg_catalog.jsonb_build_object(
        'id', a.id, 'auth_user_id', a.id, 'username', a.email, 'name', a.email,
        'email', a.email, 'role', 'admin', 'work_positions', '[]'::jsonb
      )
  end
  from auth.users a
  left join public.users u on u.auth_user_id = a.id
  where a.id = (select auth.uid());
$$;

create or replace function boss_private.staff_can(allowed text[])
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    p ->> 'role' = 'admin' or p ->> 'role' = any(allowed)
    or exists (
      select 1 from pg_catalog.jsonb_array_elements_text(p -> 'work_positions') as r(position)
      where r.position <> 'admin' and r.position = any(allowed)
    ), false)
  from (select boss_private.staff_profile() as p) as profile;
$$;

create or replace function public.boss_staff_profile()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select boss_private.staff_profile(); $$;

revoke all on function boss_private.staff_profile(), boss_private.staff_can(text[]),
  public.boss_staff_profile() from public, anon;
grant execute on function boss_private.staff_profile(), boss_private.staff_can(text[]),
  public.boss_staff_profile() to authenticated;

-- Only an Auth administrator can create an invited Auth user. The Auth insert
-- and profile link commit together, including retries after an email failure.
create or replace function boss_private.bind_staff_invitation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.invited_at is not null then
    update public.users
    set auth_user_id = new.id, auth_invite_pending = false
    where auth_invite_pending and auth_user_id is null and lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;
revoke all on function boss_private.bind_staff_invitation() from public, anon, authenticated;
create or replace trigger boss_bind_staff_invitation after insert or update of invited_at on auth.users
  for each row execute function boss_private.bind_staff_invitation();

grant select (auth_user_id, auth_invite_pending), insert (auth_invite_pending),
  update (auth_invite_pending) on public.users to authenticated;

-- Departments share the rows in the tables used by their workflows.
-- Directory data of other employees is only visible to Admin/HR or reduced to
-- the limited assignment directory exposed below.
do $$
declare
  rule record;
  operation text;
  roles text;
  condition text;
  expressions text;
begin
  for rule in
    select * from (values
      ('orders', 'sales,accounting,finance,prep,frontdesk,onsite,repair,hr', 'sales', 'sales,accounting,finance,prep,frontdesk,onsite', 'sales'),
      ('items', 'sales,accounting,finance,prep,frontdesk,onsite,repair', 'accounting,prep,frontdesk', 'accounting,prep,frontdesk,onsite', ''),
      ('repair_tickets', 'repair,frontdesk,onsite,hr', 'repair,frontdesk,onsite', 'repair,frontdesk,onsite', 'repair'),
      ('products', 'sales,accounting,onsite', 'sales', 'sales', 'sales'),
      ('stock_pos', 'accounting,finance,hr', 'accounting', 'accounting', ''),
      ('projects', 'sales,accounting,finance,prep,frontdesk,onsite,hr', 'sales', 'sales,accounting,finance,prep,frontdesk,onsite', ''),
      ('contracts', 'sales,finance', 'sales', 'sales', ''),
      ('contract_items', 'sales,finance', 'sales', 'sales', ''),
      ('users', 'hr', '', '', '')
    ) as roles(tablename, reading, inserting, updating, deleting)
  loop
    execute format('drop policy if exists boss_admin_guard on public.%I', rule.tablename);
    execute format('drop policy if exists boss_admin_access on public.%I', rule.tablename);
    foreach operation in array array['select','insert','update','delete'] loop
      roles := case operation when 'select' then rule.reading when 'insert' then rule.inserting
        when 'update' then rule.updating else rule.deleting end;
      condition := format('(select boss_private.staff_can(%L::text[]))', '{' || roles || '}');
      expressions := case operation
        when 'insert' then format('with check (%s)', condition)
        when 'update' then format('using (%s) with check (%s)', condition, condition)
        else format('using (%s)', condition)
      end;
      execute format('drop policy if exists %I on public.%I', 'boss_staff_' || operation, rule.tablename);
      execute format('drop policy if exists %I on public.%I', 'boss_staff_guard_' || operation, rule.tablename);
      execute format('create policy %I on public.%I for %s to authenticated %s',
        'boss_staff_' || operation, rule.tablename, operation, expressions);
      execute format('create policy %I on public.%I as restrictive for %s to public %s',
        'boss_staff_guard_' || operation, rule.tablename, operation, expressions);
    end loop;
  end loop;
end;
$$;

-- A salesperson may remove an untouched draft, preserving downstream work.
drop policy if exists boss_sales_delete_draft on public.orders;
create policy boss_sales_delete_draft on public.orders as restrictive for delete to authenticated
using (
  (select boss_private.staff_can(array[]::text[]))
  or (
    order_status = 'pending_purchasing' and bill_no is null and po_created_at is null
    and coalesce(billing_status, 'pending') = 'pending'
    and not exists (select 1 from public.items i where i.order_id = orders.id)
  )
);

create or replace function boss_private.protect_billing_fields()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  billing_changed boolean;
begin
  if current_user <> 'authenticated' or boss_private.staff_can(array['finance']) then
    return new;
  end if;
  billing_changed := case when tg_op = 'INSERT' then
      coalesce(new.billing_status, 'pending') <> 'pending'
        or new.billed_at is not null or new.billed_by is not null or new.tax_invoice_no is not null
    else
      (new.billing_status, new.billed_at, new.billed_by, new.tax_invoice_no)
        is distinct from (old.billing_status, old.billed_at, old.billed_by, old.tax_invoice_no)
    end;
  if billing_changed then
    raise exception 'Billing changes require finance access' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function boss_private.protect_billing_fields() from public, anon, authenticated;
drop trigger if exists boss_protect_order_billing on public.orders;
create trigger boss_protect_order_billing before insert or update on public.orders
  for each row execute function boss_private.protect_billing_fields();
drop trigger if exists boss_protect_project_billing on public.projects;
create trigger boss_protect_project_billing before insert or update on public.projects
  for each row execute function boss_private.protect_billing_fields();

create or replace function boss_private.protect_order_workflow()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or boss_private.staff_can(array['accounting']) then
    return new;
  end if;

  if (new.bill_no, new.po_created_at, new.po_received_at, new.stock_cut_at)
      is distinct from (old.bill_no, old.po_created_at, old.po_received_at, old.stock_cut_at)
    or ((new.order_status, new.fulfilled_at) is distinct from (old.order_status, old.fulfilled_at)
      and not (new.order_status = 'fulfilled' and boss_private.staff_can(array['frontdesk','onsite'])))
  then
    raise exception 'Order workflow changes require the assigned department' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function boss_private.protect_order_workflow() from public, anon, authenticated;
drop trigger if exists boss_protect_order_workflow on public.orders;
create trigger boss_protect_order_workflow before update on public.orders
  for each row execute function boss_private.protect_order_workflow();

create or replace function boss_private.update_own_profile(changes jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if (select boss_private.staff_profile()) is null
    or pg_catalog.jsonb_typeof(changes) is distinct from 'object'
    or (changes - array['phone','address','avatar','profile_details']) <> '{}'::jsonb
  then
    raise exception 'Invalid staff profile update' using errcode = '42501';
  end if;
  update public.users u
  set phone = case when changes ? 'phone' then changes ->> 'phone' else u.phone end,
      address = case when changes ? 'address' then changes ->> 'address' else u.address end,
      avatar = case when changes ? 'avatar' then changes ->> 'avatar' else u.avatar end,
      profile_details = case when changes ? 'profile_details' then changes ->> 'profile_details' else u.profile_details end
  where u.auth_user_id = (select auth.uid()) and u.is_active;
  if not found then
    raise exception 'No linked staff profile' using errcode = '42501';
  end if;
  return boss_private.staff_profile();
end;
$$;

create or replace function public.boss_update_own_profile(changes jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select boss_private.update_own_profile(changes); $$;

revoke all on function boss_private.update_own_profile(jsonb), public.boss_update_own_profile(jsonb)
  from public, anon;
grant execute on function boss_private.update_own_profile(jsonb), public.boss_update_own_profile(jsonb)
  to authenticated;

create or replace function boss_private.assignment_directory()
returns table (id text, username text, name text, nickname text, role text,
  assigned_route text, is_active boolean, work_positions text[])
language sql stable security definer set search_path = ''
as $$
  select u.id, u.id, u.name, u.nickname, u.role, u.assigned_route, u.is_active, u.work_positions
  from public.users u
  where (select boss_private.staff_can(array['sales','accounting','finance','prep','frontdesk','onsite','repair','hr']))
    and u.is_active
  order by u.name;
$$;

create or replace function public.boss_assignment_directory()
returns table (id text, username text, name text, nickname text, role text,
  assigned_route text, is_active boolean, work_positions text[])
language sql stable security invoker set search_path = ''
as $$ select * from boss_private.assignment_directory(); $$;

revoke all on function boss_private.assignment_directory(), public.boss_assignment_directory()
  from public, anon;
grant execute on function boss_private.assignment_directory(), public.boss_assignment_directory()
  to authenticated;

-- The invitation endpoint may link a verified Auth account that already
-- existed before the employee directory was introduced.
create or replace function boss_private.link_existing_staff_auth(target_id text, target_email text)
returns uuid language sql security definer set search_path = ''
as $$
  update public.users u
  set auth_user_id = a.id, auth_invite_pending = false
  from auth.users a
  where u.id = target_id and u.auth_invite_pending and u.is_active and u.auth_user_id is null
    and lower(u.email) = lower(target_email) and lower(a.email) = lower(target_email)
    and a.email_confirmed_at is not null
    and a.raw_app_meta_data ->> 'boss_role' is distinct from 'admin'
    and not exists (select 1 from public.users linked where linked.auth_user_id = a.id)
  returning a.id;
$$;

create or replace function public.boss_link_existing_staff_auth(target_id text, target_email text)
returns uuid language sql security invoker set search_path = ''
as $$ select boss_private.link_existing_staff_auth(target_id, target_email); $$;

revoke all on function boss_private.link_existing_staff_auth(text, text),
  public.boss_link_existing_staff_auth(text, text) from public, anon, authenticated;
grant usage on schema boss_private to service_role;
grant execute on function boss_private.link_existing_staff_auth(text, text),
  public.boss_link_existing_staff_auth(text, text) to service_role;

commit;
