// Vercel serverless function: proxies chat requests to Ollama and streams the reply.
// The API key lives ONLY in Vercel environment variables (never sent to the browser).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OLLAMA_API_KEY is not set in Vercel environment variables." });
    return;
  }

  const host = (process.env.OLLAMA_HOST || "https://ollama.com").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "gemma4";

  let messages = req.body && req.body.messages;
  if (typeof req.body === "string") {
    try { messages = JSON.parse(req.body).messages; } catch { /* ignore */ }
  }
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Body must be { messages: [...] }" });
    return;
  }

  try {
    const upstream = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      res.status(upstream.status || 502).json({ error: text || "Upstream error" });
      return;
    }

    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");

    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: String(err && err.message || err) });
    else res.end();
  }
}
