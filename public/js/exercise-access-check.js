(async () => {
  await initSupabase();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const statusEl = document.getElementById('status-msg');

  if (!token) { statusEl.textContent = 'Invalid link — no token provided.'; return; }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    return;
  }

  const { data: assignment, error } = await supabaseClient
    .from('assignments')
    .select('*, problems(*)')
    .eq('token', token)
    .single();

  if (error || !assignment) { statusEl.textContent = 'Assignment not found.'; return; }

  if (assignment.participant_email.toLowerCase() !== session.user.email.toLowerCase()) {
    statusEl.textContent = `This exercise is assigned to ${assignment.participant_email}, but you're logged in as ${session.user.email}. Please log in with the correct account.`;
    return;
  }

  statusEl.textContent = `Access granted. Loading exercise: ${assignment.problems.title}... (Full exercise interface coming in Phase 4)`;
})();
