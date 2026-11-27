begin;
set local role postgres;

-- All active staff can read the operational pages. The existing write
-- policies and workflow triggers still enforce the roles for mutations.
do $$
declare
  table_name text;
  staff_check constant text :=
    '(select boss_private.staff_can(array[''sales'',''accounting'',''finance'',''prep'',''frontdesk'',''onsite'',''repair'',''hr'']))';
begin
  foreach table_name in array array[
    'orders', 'items', 'repair_tickets', 'products', 'stock_pos',
    'projects', 'contracts', 'contract_items'
  ] loop
    execute format('drop policy if exists boss_staff_select on public.%I', table_name);
    execute format('drop policy if exists boss_staff_guard_select on public.%I', table_name);
    execute format('create policy boss_staff_select on public.%I for select to authenticated using (%s)', table_name, staff_check);
    execute format('create policy boss_staff_guard_select on public.%I as restrictive for select to public using (%s)', table_name, staff_check);
  end loop;
end;
$$;

commit;
