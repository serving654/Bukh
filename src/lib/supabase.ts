import { createClient } from '@supabase/supabase-js';
const cfg=(window as any).LAUNCHPAD_CONFIG ?? {};
export const supabase=createClient(cfg.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL, cfg.supabasePublishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export const APP_URL=window.location.origin + window.location.pathname;
