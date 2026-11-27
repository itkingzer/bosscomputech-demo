import { createClient } from 'npm:@supabase/supabase-js@2.119.2';

const roles = ['admin', 'sales', 'accounting', 'finance', 'prep', 'frontdesk', 'onsite', 'repair', 'hr'];
const fields = 'id,name,email,role,work_positions,is_active,auth_user_id,auth_invite_pending';

Deno.serve(async request => {
  let site: URL | undefined;
  try {
    site = new URL(Deno.env.get('STAFF_SITE_URL') ?? '');
  } catch {
    // Requests without a valid configured site fail below.
  }
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Origin': site?.origin ?? '',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-region',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const response = (body: object, status = 200) => Response.json(body, { status, headers });
  if (origin && origin !== headers['Access-Control-Allow-Origin']) return response({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey || site?.protocol !== 'https:') return response({ error: 'Staff invitations are not configured' }, 503);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Sign in first' }, 401);
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: actor, error: accessError } = await caller.rpc('boss_staff_profile');
  if (accessError || actor?.role !== 'admin') return response({ error: 'Admin access required' }, 403);

  const input = await request.json().catch(() => null);
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response({ error: 'Enter a valid email address' }, 400);
  }
  if (email === actor.email?.toLowerCase()) return response({ error: 'This is your own sign-in account' }, 409);
  const existingId = typeof input.id === 'string' ? input.id : null;
  const profileId = existingId ?? crypto.randomUUID();
  if (existingId) {
    const { data: profile, error } = await caller.from('users').select(fields).eq('id', existingId).single();
    if (error || !profile || !profile.is_active) return response({ error: 'Active staff profile required' }, 409);
    if (profile.auth_user_id) return response({ error: 'This profile already has a sign-in account' }, 409);
    if (profile.auth_invite_pending && profile.email !== email) {
      return response({ error: 'Retry the invitation using the original email address' }, 409);
    }
    const { data: updated, error: updateError } = await caller.from('users')
      .update({ email, auth_invite_pending: true }).eq('id', existingId)
      .is('auth_user_id', null).eq('is_active', true).select('id').maybeSingle();
    if (updateError || !updated) return response({ error: 'Could not reserve this invitation' }, 409);
  } else {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const positions = input.work_positions;
    if (!name || name.length > 150 || !roles.includes(input.role) || !Array.isArray(positions)
      || positions.length > roles.length || positions.some(role => role === 'admin' || !roles.includes(role))) {
      return response({ error: 'Enter a valid staff name and role' }, 400);
    }
    const { error } = await caller.from('users').insert({
      id: profileId,
      username: email,
      name,
      email,
      role: input.role,
      work_positions: [...new Set(positions)],
      is_active: true,
      auth_invite_pending: true,
    });
    if (error) return response({ error: 'A staff profile already uses this email, or the invitation could not be saved' }, 409);
  }

  const authAdmin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: linkedId, error: linkError } = await authAdmin.rpc('boss_link_existing_staff_auth', {
    target_id: profileId,
    target_email: email,
  });
  if (linkError) return response({ error: 'Could not link this staff profile' }, 409);
  const { error } = linkedId
    ? await caller.auth.resetPasswordForEmail(email, { redirectTo: site.href })
    : await authAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: site.href });
  if (error) {
    // Keep the reserved directory row so the administrator can retry from it.
    return response({ error: error.message }, error.status === 429 ? 429 : 409);
  }
  return response({ invited: true });
});
