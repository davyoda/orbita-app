// Órbita · transcrição de áudio com o Whisper (via Groq, plano gratuito).
import { authorize, cors, fail, json } from "../_shared/mod.ts";

const KEY = Deno.env.get("GROQ_API_KEY") || "";
const MODEL = Deno.env.get("TRANSCRIBE_MODEL") || "whisper-large-v3-turbo";
// Frases que o Whisper costuma "inventar" em trechos de silêncio.
const HALLUCINATIONS = [/legendas pela comunidade amara/i, /obrigad[oa] por assistir/i, /^\s*(tchau|obrigad[oa])[.!]?\s*$/i, /thanks for watching/i, /subtitles by/i, /inscreva-se no canal/i];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);
  const who = await authorize(req);
  if (who instanceof Response) return who;
  if (!KEY) return fail("unavailable", "A transcrição não está configurada no servidor.", 500);

  let form: FormData;
  try { form = await req.formData(); } catch { return fail("bad_request", "Envie o áudio como formulário."); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("bad_request", "Áudio vazio.");
  if (file.size > 24 * 1024 * 1024) return fail("too_large", "Trecho de áudio grande demais (máximo 24 MB).", 413);
  const lang = String(form.get("language") || "").slice(0, 2);
  const prompt = String(form.get("prompt") || "").slice(0, 600);

  const out = new FormData();
  out.append("file", file, file.name || "audio.webm");
  out.append("model", MODEL);
  out.append("response_format", "json");
  out.append("temperature", "0");
  if (lang === "pt" || lang === "en") out.append("language", lang);
  if (prompt) out.append("prompt", prompt);

  const r = await fetch(`${Deno.env.get("GROQ_BASE_URL") || "https://api.groq.com"}/openai/v1/audio/transcriptions`, {
    method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: out,
  }).catch(() => null);
  if (!r) return fail("upstream_error", "O serviço de transcrição não respondeu.", 502);
  if (!r.ok) {
    const t = await r.text();
    console.error("groq", r.status, t.slice(0, 400));
    if (r.status === 429) return fail("rate_limited", "Limite gratuito de transcrição atingido por agora. Tente de novo mais tarde.", 429);
    return fail("upstream_error", "A transcrição falhou neste trecho.", 502);
  }
  const data = await r.json();
  let text = String(data.text || "").trim();
  if (HALLUCINATIONS.some((re) => re.test(text))) text = "";
  return json({ text });
});
