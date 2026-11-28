import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

const staffDomain = 'staff.bosscomputech.invalid';
const roles = ['sales', 'accounting', 'finance', 'prep', 'frontdesk', 'onsite', 'repair', 'hr'];
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,39}$/;

Deno.serve(async request => {
  const siteUrl = Deno.env.get('STAFF_SITE_URL');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!siteUrl || !url || !anonKey || !serviceKey) return Response.json({ error: 'Staff accounts are not configured' }, { status: 503 });

  const origin = new URL(siteUrl).origin;
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-region',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const reply = (body: object, status = 200) => Response.json(body, { status, headers });
  const fail = (error: string, status = 400) => reply({ error }, status);
  if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return fail('Origin not allowed', 403);
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return fail('Method not allowed', 405);

  const input = await request.json().catch(() => null);
  if (!input) return fail('Invalid request');
  const auth = { persistSession: false, autoRefreshToken: false };
  const service = createClient(url, serviceKey, { auth });
  if (input.action === 'recover-admin') {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@' + staffDomain)) return fail('Enter an administrator email');
    const { data, error } = await service.rpc('boss_can_recover_admin', { target_email: email });
    if (error) return fail('Password recovery is temporarily unavailable', 503);
    if (data) {
      const { error: recoveryError } = await createClient(url, anonKey, { auth }).auth.resetPasswordForEmail(email, { redirectTo: siteUrl });
      if (recoveryError && recoveryError.status !== 429) console.warn('Admin password recovery failed', recoveryError.status);
    }
    // A uniform response also covers addresses without administrator access.
    return reply({ ok: true });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return fail('Sign in first', 401);
  const caller = createClient(url, anonKey, { auth, global: { headers: { Authorization: authorization } } });
  const { data: actor, error: accessError } = await caller.rpc('boss_staff_profile');
  const isAdmin = actor?.role === 'admin';
  const isSuperadmin = isAdmin && actor?.is_superadmin === true;
  const isHr = actor?.role === 'hr' || actor?.work_positions?.includes('hr');
  if (accessError || (!isAdmin && !isHr)) return fail('Admin or HR access required', 403);

  const id = typeof input.id === 'string' ? input.id : null;
  if (input.id !== undefined && !id) return fail('Invalid staff profile ID');
  if (input.action === 'delete') {
    if (!isSuperadmin) return fail('Superadmin access required', 403);
    if (!id) return fail('Invalid staff profile ID');
    const { data, error } = await service.rpc('boss_delete_staff_account', {
      actor_id: actor.auth_user_id,
      target_id: id,
    });
    if (error) return fail('Could not delete account', error.code === '42501' ? 403 : 409);
    return data ? reply({ ok: true }) : fail('Staff profile not found', 404);
  }
  let target = null;
  if (id) {
    const { data, error } = await service.from('users')
      .select('id,auth_user_id,email,username,role,work_positions,is_active')
      .eq('id', id).single();
    if (error || !data) return fail('Staff profile not found', 404);
    target = data;
    if (input.action === 'update-profile') {
      if (target.role === 'admin' && (!isSuperadmin || target.id === actor.id
        || target.auth_user_id === actor.auth_user_id)) return fail('This account is protected', 403);
      if (target.auth_user_id) {
        const { data: account, error: accountError } = await service.auth.admin.getUserById(target.auth_user_id);
        if (accountError || !account.user || (!isSuperadmin && account.user.app_metadata.boss_role === 'admin')
          || account.user.app_metadata.boss_superadmin === true) return fail('This account is protected', 403);
      }
      const changes = input.profile;
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return fail('Invalid profile');
      const limits = { name: 150, nickname: 100, department: 150, phone: 50, badge: 80,
        avatar: 2_000_000, profile_details: 20_000, employment_start_date: 10 };
      if (typeof changes.name !== 'string' || !changes.name.trim()
        || Object.entries(changes).some(([key, value]) => !Object.hasOwn(limits, key)
          || (value !== null && (typeof value !== 'string' || value.length > limits[key as keyof typeof limits])))) {
        return fail('Invalid profile details');
      }
      const update = service.from('users').update(changes).eq('id', id);
      const { error: saveError } = await (isSuperadmin ? update : update.neq('role', 'admin')).select('id').single();
      return saveError ? fail('Could not save staff profile', 409) : reply({ ok: true });
    }
    if (target.id === actor?.id || target.auth_user_id === actor?.auth_user_id || (!isSuperadmin && target.role === 'admin')
      || (!isAdmin && (target.role === 'hr' || target.work_positions?.includes('hr')))) {
      return fail('This account is protected', 403);
    }
    if (target.auth_user_id) {
      const { data: account, error: accountError } = await service.auth.admin.getUserById(target.auth_user_id);
      if (accountError || !account.user || (!isSuperadmin && account.user.app_metadata.boss_role === 'admin')) {
        return fail('This account is protected', 403);
      }
      if (account.user.app_metadata.boss_superadmin === true) return fail('This account is protected', 403);
    }
  }

  if (input.action === 'set-active') {
    if (!id || typeof input.active !== 'boolean') return fail('Invalid account status');
    const { error } = await service.from('users').update({ is_active: input.active }).eq('id', id);
    return error ? fail('Could not update account status', 409) : reply({ ok: true });
  }
  const inviteAdmin = input.action === 'invite-admin';
  if (input.action !== 'save' && !inviteAdmin) return fail('Invalid action');
  if (inviteAdmin && (!isSuperadmin || input.role !== 'admin' || target?.auth_user_id)) {
    return fail('Only a superadmin can invite a new administrator by email', 403);
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const positions = input.work_positions;
  const adminAccount = input.role === 'admin';
  const keepEmailLogin = adminAccount && Boolean(target?.auth_user_id && target.email?.toLowerCase() === username && !username.endsWith('@' + staffDomain));
  const emailLogin = inviteAdmin || keepEmailLogin;
  const validLogin = emailLogin
    ? username.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) && !username.endsWith('@' + staffDomain)
    : usernamePattern.test(username);
  if (!name || name.length > 150 || !validLogin || (!roles.includes(input.role) && !(adminAccount && isSuperadmin))
    || !Array.isArray(positions) || positions.length > roles.length || positions.some(role => !roles.includes(role))) {
    return fail('Check name, username, and staff positions');
  }
  if (!isAdmin && (input.role === 'hr' || positions.includes('hr'))) return fail('Only an administrator can assign HR access', 403);
  const email = emailLogin ? username : username + '@' + staffDomain;
  const needsPassword = !target?.auth_user_id || target.email !== email;
  if (!inviteAdmin && (needsPassword || password) && (password.length < 8 || new TextEncoder().encode(password).length > 72)) {
    return fail('Use a password with at least 8 characters and at most 72 bytes');
  }
  const profile = { name, username, role: input.role, work_positions: [...new Set(positions)] };
  const profileId = id ?? crypto.randomUUID();

  if (target?.auth_user_id) {
    if (target.username !== username) {
      const { data: duplicate, error } = await service.from('users')
        .select('id').eq('username', username).neq('id', profileId).maybeSingle();
      if (error || duplicate) return fail('Username is already in use or unavailable', 409);
    }
    if (password) {
      const { error } = await service.auth.admin.updateUserById(target.auth_user_id, { email, email_confirm: true, password });
      if (error) return fail(error.message, 409);
    }
    const { error } = await service.from('users').update({ ...profile, email, auth_invite_pending: false }).eq('id', profileId);
    return error ? fail('Could not save staff profile', 409) : reply({ ok: true });
  }

  const reservation = { ...profile, email, auth_invite_pending: true };
  const saved = id
    ? await service.from('users').update(reservation).eq('id', id).is('auth_user_id', null).select('id').single()
    : await service.from('users').insert({ id: profileId, ...reservation, is_active: true });
  if (saved.error) return fail('Username is already in use or the profile could not be saved', 409);

  const { data, error } = inviteAdmin
    ? await service.auth.admin.inviteUserByEmail(email, { redirectTo: siteUrl })
    : await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { boss_staff_profile_id: profileId },
    });
  if (error) return fail(error.message, 409);
  const { data: linked, error: linkError } = await service.from('users')
    .select('auth_user_id').eq('id', profileId).single();
  if (linkError || !data.user || linked?.auth_user_id !== data.user.id) {
    return fail('ระบบยังผูกบัญชีเข้าสู่ระบบไม่สำเร็จ กรุณาติดต่อผู้ดูแล', 409);
  }
  return reply({ ok: true });
});
