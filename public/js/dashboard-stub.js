(async () => {
  await initSupabase();
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = '/index.html'; return; }

  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
  const welcomeMsg = document.getElementById('welcome-msg');
  if (welcomeMsg && profile) {
    welcomeMsg.textContent = `Signed in as ${profile.name} (${profile.email}) — Role: ${profile.role}`;
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = '/index.html';
  });
})();
