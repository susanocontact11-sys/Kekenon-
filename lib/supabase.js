import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function getOrCreateDriver(name, phone) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  let currentUser = user;

  if (!currentUser) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    currentUser = data.user;
  }

  const { data: existing } = await supabase
    .from('drivers')
    .select('*')
    .eq('auth_id', currentUser.id)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('drivers')
    .insert({ name, phone, auth_id: currentUser.id })
    .select()
    .single();

  if (insertError) throw insertError;
  return created;
}
