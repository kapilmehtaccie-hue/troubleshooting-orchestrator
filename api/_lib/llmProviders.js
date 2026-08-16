async function callOpenAI(apiKey, model, systemPrompt, userPrompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'OpenAI request failed');
    err.status = res.status;
    throw err;
  }
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey, model, systemPrompt, userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Anthropic request failed');
    err.status = res.status;
    throw err;
  }
  return data.content[0].text;
}

async function callGemini(apiKey, model, systemPrompt, userPrompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Gemini request failed');
    err.status = res.status;
    throw err;
  }
  return data.candidates[0].content.parts[0].text;
}

async function callGroq(apiKey, model, systemPrompt, userPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Groq request failed');
    err.status = res.status;
    throw err;
  }
  return data.choices[0].message.content;
}

async function callCustom(apiKey, endpoint, model, systemPrompt, userPrompt) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.2
    })
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || 'Custom provider request failed');
    err.status = res.status;
    throw err;
  }
  return data.choices[0].message.content;
}

function isRetryableError(err) {
  if (err.status && [429, 500, 502, 503, 504].includes(err.status)) return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('high demand') || msg.includes('overloaded') || msg.includes('rate limit') || msg.includes('try again');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callProviderRaw(provider, apiKey, endpoint, model, systemPrompt, userPrompt) {
  switch (provider) {
    case 'openai': return callOpenAI(apiKey, model, systemPrompt, userPrompt);
    case 'anthropic': return callAnthropic(apiKey, model, systemPrompt, userPrompt);
    case 'gemini': return callGemini(apiKey, model, systemPrompt, userPrompt);
    case 'groq': return callGroq(apiKey, model, systemPrompt, userPrompt);
    case 'custom': return callCustom(apiKey, endpoint, model, systemPrompt, userPrompt);
    default: throw new Error('Unknown provider');
  }
}

export async function callLLM(config, systemPrompt, userPrompt) {
  const { provider, apiKey, customEndpoint, customModel } = config;
  if (!customModel) throw new Error('Model name not configured.');

  const maxRetries = 2;
  const baseDelayMs = 1200;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callProviderRaw(provider, apiKey, customEndpoint, customModel, systemPrompt, userPrompt);
    } catch (err) {
      lastError = err;
      const canRetry = attempt < maxRetries && isRetryableError(err);
      if (!canRetry) throw err;
      const waitMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`LLM call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitMs}ms: ${err.message}`);
      await delay(waitMs);
    }
  }
  throw lastError;
}
