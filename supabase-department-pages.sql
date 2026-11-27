begin;
set local role postgres;

-- Share a limited work queue across departments without widening table RLS.
create or replace function boss_private.department_page(page text)
returns table(reference text, detail text, status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select boss_private.staff_profile()) is null then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  case page
    when 'sales' then
      return query select coalesce(o.sales_ref, o.bill_no, left(o.id::text, 8)),
        coalesce(o.salesperson, ''), o.order_status from public.orders o
        order by o.created_at desc limit 40;
    when 'accounting' then
      return query select p.po_number, p.product_name, p.status from public.stock_pos p
        order by p.created_at desc limit 40;
    when 'finance' then
      return query select coalesce(o.bill_no, o.sales_ref, left(o.id::text, 8)),
        ''::text, coalesce(o.billing_status, 'pending') from public.orders o
        order by o.created_at desc limit 40;
    when 'prep', 'frontdesk', 'onsite' then
      return query select left(i.id::text, 8), i.model_name, i.status from public.items i
        where i.status = any(case page
          when 'prep' then array['raw_stock','pending_prep_stock','pending_prep','prepped_in_stock']
          when 'frontdesk' then array['ready_for_dispatch','assigned_onsite']
          else array['assigned_onsite','delivered'] end)
        order by i.updated_at desc limit 40;
    when 'repair' then
      return query select r.ticket_no, coalesce(r.device_model, ''), r.status from public.repair_tickets r
        where r.service_sheet_withdrawn_at is null
        order by r.created_at desc limit 40;
    when 'hr' then
      return query select u.name, u.role, case when u.is_active then 'active' else 'inactive' end
        from public.users u where u.role <> 'admin'
        order by u.name limit 40;
    else
      raise exception 'Unknown department page' using errcode = '22023';
  end case;
end;
$$;

create or replace function public.boss_department_page(page text)
returns table(reference text, detail text, status text)
language sql stable security invoker set search_path = ''
as $$ select * from boss_private.department_page(page); $$;
revoke all on function boss_private.department_page(text), public.boss_department_page(text) from public, anon;
grant execute on function boss_private.department_page(text), public.boss_department_page(text) to authenticated;

commit;
