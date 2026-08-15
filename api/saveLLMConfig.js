import { createClient } from '@supabase/supabase-js';
import { encrypt } from './_lib/crypto.js';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { provider, apiKey, customEndpoint, customModel } = req.body;
  const encryptedKey = encrypt(apiKey, process.env.LLM_KEY_ENCRYPTION_SECRET);

  const { error } = await supabaseAdmin.from('llm_config').upsert({
    orchestrator_id: user.id,
    provider,
    api_key_encrypted: encryptedKey,
    custom_endpoint: customEndpoint || null,
    custom_model: customModel || null
  }, { onConflict: 'orchestrator_id' });

  if (error) return res.status(500).json({ success: false, error: error.message });
  res.status(200).json({ success: true });
}
