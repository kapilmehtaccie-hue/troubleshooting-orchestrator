(async () => {
  await initSupabase();
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) await handlePostLogin(session);

  const loginBtn = document.getElementById('google-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
    });
  }
})();

async function handlePostLogin(session) {
  const user = session.user;
  let { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();

  if (!profile) {
    const { data: newProfile } = await supabaseClient.from('profiles').insert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email,
      role: 'unassigned'
    }).select().single();
    profile = newProfile;
  }

  if (!profile) return;
  redirectByRole(profile.role);
}

function redirectByRole(role) {
  if (role === 'orchestrator') window.location.href = '/orchestrator.html';
  else if (role === 'unassigned') window.location.href = '/role-select.html';
  else window.location.href = '/participant.html';
}
