// Utilidades comuns às funções do Órbita.

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function fail(code: string, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}

const allowed = (Deno.env.get("ALLOWED_EMAILS") || "")
  .split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Confere o login e se o e-mail está na lista liberada. Retorna o e-mail ou uma Response de erro. */
export async function authorize(req: Request): Promise<string | Response> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return fail("not_granted", "Faça login para usar o Claude.", 401);
  // Pergunta ao próprio Supabase de quem é este login.
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") || "" },
  }).catch(() => null);
  if (!r || !r.ok) return fail("session_expired", "Sua sessão expirou. Entre de novo.", 401);
  const user = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return fail("session_expired", "Sua sessão expirou. Entre de novo.", 401);
  if (allowed.length && !allowed.includes(email)) {
    return fail("not_granted", "Esta conta ainda não está liberada para usar o Claude. Peça ao administrador do Órbita.", 403);
  }
  return email;
}
