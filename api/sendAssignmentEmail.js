import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { participants, problemTitle } = req.body;
  const siteUrl = 'https://troubleshooting-orchestrator.vercel.app';

  try {
    for (const p of participants) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: p.email,
          subject: 'New Troubleshooting Exercise Assigned',
          html: `<p>Hi ${p.name},</p><p>You've been assigned a new troubleshooting exercise: <strong>${problemTitle}</strong>.</p><p>Log in at <a href="${siteUrl}">${siteUrl}</a> using this Google account (${p.email}) to begin.</p>`
        })
      });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
