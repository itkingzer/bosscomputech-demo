begin;
set local role postgres;

-- The staff account function reserves and links directory rows on the server.
grant select, insert, update on public.users to service_role;

-- Commit Auth creation and directory linking together. Only Auth admin
-- operations can set app metadata.
create or replace function boss_private.bind_staff_password_account()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  profile_id text := new.raw_app_meta_data ->> 'boss_staff_profile_id';
begin
  if profile_id is null then
    return new;
  end if;

  update public.users
  set auth_user_id = new.id, auth_invite_pending = false
  where id = profile_id and auth_user_id is null and auth_invite_pending
    and email = new.email;

  if not found then
    raise exception 'Staff account reservation no longer matches';
  end if;
  return new;
end;
$$;

revoke all on function boss_private.bind_staff_password_account() from public, anon, authenticated;
create or replace trigger boss_bind_staff_password_account after insert on auth.users
  for each row execute function boss_private.bind_staff_password_account();

create or replace function boss_private.can_recover_admin(target_email text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users a
    left join public.users u on u.auth_user_id = a.id
    where lower(a.email) = lower(target_email)
      and ((u.id is not null and u.is_active and u.role = 'admin')
        or (u.id is null and a.raw_app_meta_data ->> 'boss_role' = 'admin'))
  );
$$;

create or replace function public.boss_can_recover_admin(target_email text)
returns boolean language sql stable set search_path = ''
as $$ select boss_private.can_recover_admin(target_email); $$;

revoke all on function boss_private.can_recover_admin(text), public.boss_can_recover_admin(text)
  from public, anon, authenticated;
grant execute on function boss_private.can_recover_admin(text), public.boss_can_recover_admin(text)
  to service_role;

commit;
