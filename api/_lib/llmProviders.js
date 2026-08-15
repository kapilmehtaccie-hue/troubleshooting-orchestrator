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
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI request failed');
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
  if (!res.ok) throw new Error(data.error?.message || 'Anthropic request failed');
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
  if (!res.ok) throw new Error(data.error?.message || 'Gemini request failed');
  return data.candidates[0].content.parts[0].text;
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
  if (!res.ok) throw new Error(data.error?.message || 'Custom provider request failed');
  return data.choices[0].message.content;
}

export async function callLLM(config, systemPrompt, userPrompt) {
  const { provider, apiKey, customEndpoint, customModel } = config;
  if (!customModel) throw new Error('Model name not configured.');
  switch (provider) {
    case 'openai': return callOpenAI(apiKey, customModel, systemPrompt, userPrompt);
    case 'anthropic': return callAnthropic(apiKey, customModel, systemPrompt, userPrompt);
    case 'gemini': return callGemini(apiKey, customModel, systemPrompt, userPrompt);
    case 'custom': return callCustom(apiKey, customEndpoint, customModel, systemPrompt, userPrompt);
    default: throw new Error('Unknown provider');
  }
}
