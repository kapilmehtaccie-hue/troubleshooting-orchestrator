(async () => {
  await initSupabase();
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = '/index.html'; return; }

  document.getElementById('become-orchestrator-btn').addEventListener('click', async () => {
    await supabaseClient.from('profiles').update({ role: 'orchestrator' }).eq('id', session.user.id);
    window.location.href = '/orchestrator.html';
  });

  document.getElementById('continue-participant-btn').addEventListener('click', async () => {
    await supabaseClient.from('profiles').update({ role: 'participant' }).eq('id', session.user.id);
    window.location.href = '/participant.html';
  });
})();
