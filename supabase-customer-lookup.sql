begin;
set local role postgres;

create schema if not exists boss_customer;
revoke all on schema boss_customer from public;
grant usage on schema boss_customer to anon, authenticated;

create index if not exists boss_public_repair_ticket_lookup on public.repair_tickets (lower(btrim(ticket_no)));
create index if not exists boss_public_warranty_serial_lookup on public.items (lower(btrim(serial_number)));

create or replace function boss_customer.lookup(lookup_mode text, lookup_code text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  code text := lower(btrim(lookup_code));
  result jsonb;
begin
  if code is null or length(code) < 1 or length(code) > 128 then return null; end if;
  if lookup_mode = 'repair' then
    select jsonb_build_object('ticket_no', r.ticket_no, 'repair_status', r.repair_status,
      'status', r.status, 'received_at', coalesce(r.received_at, r.created_at))
    into result from public.repair_tickets r
    where lower(btrim(r.ticket_no)) = code and r.service_sheet_withdrawn_at is null
    order by r.created_at desc limit 1;
  elsif lookup_mode = 'warranty' then
    select jsonb_build_object(
      'serialNumber', i.serial_number, 'modelName', i.model_name,
      'warrantyYears', coalesce(i.warranty_years, (line.data->>'warranty_years')::integer,
        (project_line.data->>'warranty_years')::integer, 0),
      'warrantyMonths', coalesce(i.warranty_months, (line.data->>'warranty_months')::integer, 0),
      'voidDate', coalesce(i.warranty_void_date, i.void_date::timestamp at time zone 'Asia/Bangkok', i.warranty_applied_at),
      'expireDate', i.warranty_expire_date)
    into result from public.items i
    left join public.orders o on o.id = i.order_id
    left join public.projects p on p.id = i.project_id
    left join lateral (
      select entry as data from jsonb_array_elements(o.items_list) entry
      where lower(btrim(entry->>'model_name')) = lower(btrim(i.model_name))
        or jsonb_array_length(o.items_list) = 1
      limit 1
    ) line on true
    left join lateral (
      select entry as data from jsonb_array_elements(p.items) entry
      where entry->>'id' = i.project_item_id or entry->>'model_name' = i.model_name
      limit 1
    ) project_line on true
    where lower(btrim(i.serial_number)) = code
    order by (i.warranty_expire_date is not null or i.warranty_void_date is not null or i.void_date is not null) desc,
      (i.order_id is not null) desc, i.id
    limit 1;
  end if;
  return result;
end;
$$;

create or replace function public.boss_customer_lookup(lookup_mode text, lookup_code text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select boss_customer.lookup(lookup_mode, lookup_code); $$;

revoke all on function boss_customer.lookup(text, text), public.boss_customer_lookup(text, text) from public;
grant execute on function boss_customer.lookup(text, text), public.boss_customer_lookup(text, text) to anon, authenticated;

commit;
