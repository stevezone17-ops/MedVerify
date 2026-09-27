/**
 * Supabase client configuration for MedVerify frontend.
 * Provides Realtime subscription helpers for Admin Live Activity and My Activity.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL.startsWith('http') &&
    SUPABASE_URL !== 'https://your-project.supabase.co'
  );
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * Subscribe to realtime verification records stream.
 * Automatically updates admin command center or recent feeds when new verifications occur.
 */
export function subscribeToVerifications(
  onInsert: (payload: any) => void,
  userId?: string,
): (() => void) | null {
  if (!supabase) return null;

  const channelName = userId ? `user-verifications-${userId}` : 'admin-verifications-feed';
  const channel = supabase.channel(channelName);

  channel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'verification_records',
        ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
      },
      (payload) => {
        onInsert(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase?.removeChannel(channel);
  };
}
