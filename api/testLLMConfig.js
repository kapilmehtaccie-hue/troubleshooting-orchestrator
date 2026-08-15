import { createClient } from '@supabase/supabase-js';
import { callLLM } from './_lib/llmProviders.js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { provider, apiKey, customEndpoint, customModel } = req.body;
  if (!customModel) return res.status(400).json({ success: false, error: 'Model name is required.' });
  if (!apiKey) return res.status(400).json({ success: false, error: 'API key is required.' });

  try {
    const raw = await callLLM(
      { provider, apiKey, customEndpoint, customModel },
      'Respond only with valid JSON.',
      'Return exactly this JSON: {"status":"ok"}'
    );
    res.status(200).json({ success: true, raw });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
}
