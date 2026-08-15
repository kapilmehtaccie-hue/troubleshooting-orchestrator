import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function encrypt(text, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

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
