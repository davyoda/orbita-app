// Órbita · ponte com a API do Claude.
// A chave fica só aqui no servidor. O app escolhe um "nível" (quick/default/complex);
// o modelo de cada nível é definido aqui e pode ser trocado sem atualizar o app.
import { authorize, cors, fail, json } from "../_shared/mod.ts";

const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODELS: Record<string, string> = {
  quick: Deno.env.get("MODEL_QUICK") || "claude-haiku-5-5",
  default: Deno.env.get("MODEL_DEFAULT") || "claude-sonnet-5-5",
  complex: Deno.env.get("MODEL_COMPLEX") || "claude-sonnet-5-5",
};
const JSON_RULE = "Responda apenas com um único objeto JSON válido. Nada de texto antes ou depois e nada de cercas de código.";

type Img = { media_type: string; data: string };
type Msg = { role: "user" | "assistant"; content: string };

function buildMessages(messages: Msg[], images: Img[]) {
  const out = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] as unknown[] }));
  if (images.length) {
    let i = out.length - 1;
    while (i >= 0 && out[i].role !== "user") i--;
    if (i >= 0) {
      out[i].content = [
        ...images.slice(0, 20).map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })),
        ...out[i].content,
      ];
    }
  }
  return out;
}

function mapError(status: number, text: string) {
  if (status === 429 || status === 529) return { code: "rate_limited", message: "Muitos pedidos agora. Tente de novo em instantes.", status: 429 };
  if (status === 413 || /prompt is too long|too many tokens|exceeds/i.test(text)) return { code: "prompt_too_large", message: "Texto grande demais para um pedido.", status: 413 };
  if (status === 401 || status === 403) return { code: "sampling_disabled", message: "A chave da API do Claude não foi aceita. Confira os segredos do servidor.", status: 502 };
  if (status === 400 && /credit|billing|balance/i.test(text)) return { code: "sampling_disabled", message: "Os créditos da API do Claude acabaram.", status: 402 };
  if (status === 400 && /image/i.test(text)) return { code: "image_rejected", message: "Não consegui usar essa imagem.", status: 400 };
  return { code: "upstream_error", message: "O Claude não respondeu agora.", status: 502 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);
  const who = await authorize(req);
  if (who instanceof Response) return who;
  if (!KEY) return fail("sampling_disabled", "A chave da API do Claude não está configurada no servidor.", 500);

  let body: { messages?: Msg[]; images?: Img[]; json?: boolean; tier?: string; max_tokens?: number; stream?: boolean; system?: string };
  try { body = await req.json(); } catch { return fail("bad_request", "Pedido inválido."); }
  const messages = buildMessages(Array.isArray(body.messages) ? body.messages : [], Array.isArray(body.images) ? body.images : []);
  if (!messages.length || messages[messages.length - 1].role !== "user") return fail("bad_request", "A conversa precisa terminar numa mensagem do usuário.");

  const tier = body.tier && MODELS[body.tier] ? body.tier : "default";
  const payload: Record<string, unknown> = {
    model: MODELS[tier],
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || (body.json ? 4096 : 3000), 256), 8192),
    messages,
    stream: !!body.stream && !body.json,
  };
  const system = [body.system, body.json ? JSON_RULE : ""].filter(Boolean).join("\n\n");
  if (system) payload.system = system;

  const upstream = await fetch(`${Deno.env.get("ANTHROPIC_BASE_URL") || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: req.signal,
  }).catch(() => null);
  if (!upstream) return fail("upstream_error", "Não consegui falar com o Claude.", 502);
  if (!upstream.ok) {
    const t = await upstream.text();
    const e = mapError(upstream.status, t);
    console.error("anthropic", upstream.status, t.slice(0, 500));
    return fail(e.code, e.message, e.status);
  }

  if (!payload.stream) {
    const data = await upstream.json();
    const text = (data.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    return json({ text, stop_reason: data.stop_reason, model: data.model, usage: data.usage });
  }

  // Repassa o streaming num formato simples: linhas "data: {...}".
  const enc = new TextEncoder(), dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body!.getReader();
      let buf = "", stop: string | null = null;
      const send = (o: unknown) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
            const line = chunk.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            let ev: { type?: string; delta?: { type?: string; text?: string; stop_reason?: string }; error?: { message?: string } };
            try { ev = JSON.parse(line.slice(5)); } catch { continue; }
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") send({ delta: ev.delta.text });
            else if (ev.type === "message_delta" && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
            else if (ev.type === "error") send({ error: { code: "upstream_error", message: ev.error?.message || "Erro no Claude." } });
          }
        }
        send({ done: true, stop_reason: stop });
      } catch (_e) {
        send({ error: { code: "upstream_error", message: "A resposta foi interrompida." } });
      } finally { ctrl.close(); }
    },
  });
  return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
});
