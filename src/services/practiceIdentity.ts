import type { SupabaseClient } from '@supabase/supabase-js';

// Browser UI identity only: database authorization still uses the SDK's access
// token and Supabase RLS. Do not call signOut on a transient refresh failure.
export async function practiceIdentity(auth: Pick<SupabaseClient['auth'], 'getSession'>) {
  const { data, error } = await auth.getSession();
  if (error) throw new Error('Could not restore your signed-in session. Check your connection and retry. Saved practice is kept on this device.');
  if (!data.session?.user) throw new Error('Your signed-in session is unavailable. Retry, or sign in again. Saved practice is kept on this device.');
  return data.session.user;
}
