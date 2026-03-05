// StILL · Cloudflare Worker 代理
// 支持：DeepSeek / OpenAI / Google Gemini / Anthropic Claude

const ALLOWED_ORIGIN = '*'; // 上线后可改为你的域名

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Only POST allowed' }, 405);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    const { apiKey, model = 'deepseek-chat', messages, temperature = 0.7, max_tokens = 600 } = body;

    if (!apiKey) return json({ error: 'Missing apiKey' }, 401);

    try {
      // ── Gemini ──────────────────────────────────────────────
      if (model.startsWith('gemini')) {
        const sysMsg = messages.find(m => m.role === 'system')?.content || '';
        const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
        const geminiBody = {
          contents: chatMsgs,
          generationConfig: { temperature, maxOutputTokens: max_tokens }
        };
        if (sysMsg) geminiBody.systemInstruction = { parts: [{ text: sysMsg }] };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody)
        });
        const data = await resp.json();
        if (!resp.ok) return json(data, resp.status);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return json({ choices: [{ message: { role: 'assistant', content: text } }] });
      }

      // ── Anthropic Claude ────────────────────────────────────
      if (model.startsWith('claude')) {
        const sysMsg = messages.find(m => m.role === 'system')?.content || '';
        const chatMsgs = messages.filter(m => m.role !== 'system');
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({ model, messages: chatMsgs, system: sysMsg, temperature, max_tokens })
        });
        const data = await resp.json();
        if (!resp.ok) return json(data, resp.status);
        const text = data.content?.[0]?.text || '';
        return json({ choices: [{ message: { role: 'assistant', content: text } }] });
      }

      // ── OpenAI ──────────────────────────────────────────────
      if (model.startsWith('gpt')) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature, max_tokens })
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          status: resp.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        });
      }

      // ── 阿里云百炼（通义千问）──────────────────────────────
      if (model.startsWith('qwen')) {
        const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, temperature, max_tokens })
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          status: resp.status,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        });
      }

      // ── DeepSeek（默认）────────────────────────────────────
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens })
      });
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
