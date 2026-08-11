let supabaseClient;
async function initSupabase() {
  const res = await fetch('/api/config');
  const config = await res.json();
  supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabaseClient;
}
