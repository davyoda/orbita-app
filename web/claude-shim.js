/* Órbita · camada de compatibilidade.
 * O app foi escrito para rodar dentro do claude.ai, onde window.claude.use(nome)
 * entrega a base de dados, o usuário, o Claude, o ditado e a voz.
 * Aqui a mesma interface é reconstruída sobre o Supabase (login + base),
 * a função "claude" (API do Claude) e a função "transcribe" (Whisper).
 * Assim o código do app fica praticamente igual ao do artefato. */
(() => {
  "use strict";
  const CFG = window.ORBITA_CONFIG || {};
  const ready = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
  const FN = (name) => `${String(CFG.supabaseUrl).replace(/\/$/, "")}/functions/v1/${name}`;
  const sb = ready ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "orbita-auth" } }) : null;
  const err = (code, message, extra) => Object.assign({ code, message }, extra || {});

  /* ---------------- Login ---------------- */
  let session = null, resolveSession;
  const sessionReady = new Promise((r) => { resolveSession = r; });
  async function token() {
    if (!sb) throw err("not_granted", "Servidor não configurado.");
    const { data } = await sb.auth.getSession();
    if (!data.session) throw err("session_expired", "Sua sessão expirou. Entre de novo.");
    return data.session.access_token;
  }
  function loginUI() {
    const css = `
#orbLogin{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:20px;background:#070A14 radial-gradient(900px 500px at 50% -10%,rgba(120,130,220,.18),transparent 60%);font-family:"Instrument Sans",system-ui,sans-serif;color:#E9EDF9}
#orbLogin form{width:min(380px,100%);display:flex;flex-direction:column;gap:12px}
#orbLogin h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:52px;margin:0;line-height:1}
#orbLogin p{color:#9AA3C4;margin:0 0 8px;font-size:15px}
#orbLogin input{border:1px solid rgba(220,228,255,.18);border-radius:12px;padding:12px 14px;background:rgba(255,255,255,.04);color:#E9EDF9;font:inherit;font-size:16px}
#orbLogin input:focus{outline:none;border-color:#AEB8FF}
#orbLogin button{border-radius:99px;padding:12px 16px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #E9EDF9;background:#E9EDF9;color:#0B0E1C}
#orbLogin button.alt{background:transparent;color:#9AA3C4;border-color:transparent;font-weight:500}
#orbLogin .msg{min-height:20px;font-size:13.5px;color:#F2C47E}`;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const box = document.createElement("div"); box.id = "orbLogin";
    box.innerHTML = `<form novalidate><h1>Órbita</h1><p id="olSub">Entre para ver o seu universo de estudos em qualquer aparelho.</p>
      <input type="email" id="olEmail" autocomplete="email" placeholder="E-mail" required>
      <input type="password" id="olPass" autocomplete="current-password" placeholder="Senha (mínimo 6 caracteres)" minlength="6" required>
      <button type="submit" id="olGo">Entrar</button><button type="button" class="alt" id="olMode">Primeira vez? Criar conta</button>
      <button type="button" class="alt" id="olReset">Esqueci a senha</button><div class="msg" id="olMsg" role="status"></div></form>`;
    document.body.appendChild(box);
    let mode = "in";
    const $ = (id) => box.querySelector("#" + id);
    const setMode = (m) => { mode = m; $("olGo").textContent = m === "in" ? "Entrar" : "Criar conta"; $("olMode").textContent = m === "in" ? "Primeira vez? Criar conta" : "Já tenho conta"; $("olPass").autocomplete = m === "in" ? "current-password" : "new-password"; $("olMsg").textContent = ""; };
    $("olMode").addEventListener("click", () => setMode(mode === "in" ? "up" : "in"));
    $("olReset").addEventListener("click", async () => {
      const email = $("olEmail").value.trim(); if (!email) { $("olMsg").textContent = "Escreva o seu e-mail primeiro."; return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      $("olMsg").textContent = error ? "Não consegui enviar o e-mail agora." : "Se a conta existir, o e-mail para trocar a senha chega em instantes.";
    });
    box.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("olEmail").value.trim(), password = $("olPass").value;
      if (!email || password.length < 6) { $("olMsg").textContent = "Preencha o e-mail e uma senha de pelo menos 6 caracteres."; return; }
      $("olGo").disabled = true; $("olMsg").textContent = mode === "in" ? "Entrando…" : "Criando sua conta…";
      const r = mode === "in" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
      $("olGo").disabled = false;
      if (r.error) {
        const m = r.error.message || "";
        $("olMsg").textContent = /invalid login/i.test(m) ? "E-mail ou senha incorretos." : /already registered/i.test(m) ? "Este e-mail já tem conta. Toque em \"Já tenho conta\"." : /rate/i.test(m) ? "Muitas tentativas. Espere um minuto." : "Não deu certo: " + m;
        return;
      }
      if (!r.data.session) { $("olMsg").textContent = "Conta criada. Confirme pelo link que chegou no seu e-mail e depois entre."; setMode("in"); }
    });
    return box;
  }
  async function bootAuth() {
    if (!sb) {
      document.addEventListener("DOMContentLoaded", () => console.warn("Órbita: config.js sem dados do Supabase. Rodando só neste aparelho."));
      resolveSession(null); return;
    }
    let box = null;
    const show = () => { if (!box) box = loginUI(); };
    const hide = () => { if (box) { box.remove(); box = null; } };
    sb.auth.onAuthStateChange((ev, s) => {
      if (s) { const first = !session; session = s; hide(); if (first) resolveSession(s); }
      else if (ev === "SIGNED_OUT") { try { localStorage.removeItem("orbita-psi-v1"); } catch (e) {} location.reload(); }
      if (ev === "PASSWORD_RECOVERY") showNewPassword();
    });
    const { data } = await sb.auth.getSession();
    if (data.session) { session = data.session; resolveSession(data.session); }
    else { if (document.body) show(); else document.addEventListener("DOMContentLoaded", show); }
  }
  function showNewPassword() {
    const d = document.createElement("div"); d.id = "orbLogin";
    d.innerHTML = `<form novalidate><h1>Nova senha</h1><input type="password" id="npw" placeholder="Nova senha (mínimo 6)" minlength="6"><button type="submit">Salvar</button><div class="msg" id="npm"></div></form>`;
    document.body.appendChild(d);
    d.querySelector("form").addEventListener("submit", async (e) => { e.preventDefault(); const v = d.querySelector("#npw").value; if (v.length < 6) return; const { error } = await sb.auth.updateUser({ password: v }); d.querySelector("#npm").textContent = error ? "Não consegui salvar." : "Senha trocada."; if (!error) setTimeout(() => d.remove(), 900); });
  }
  bootAuth();
  window.orbitaSignOut = async () => { if (sb) await sb.auth.signOut(); };
  window.orbitaAccount = () => session && session.user ? session.user.email : null;

  /* ---------------- Base (mesma interface do claude.ai) ---------------- */
  const parentOf = (p) => p.split("/").slice(0, -1).join("/");
  const lastOf = (p) => p.split("/").pop();
  const dbErr = (e) => err(/payload|too large|413/i.test(e && e.message || "") ? "invalid_argument" : /fetch|network|timeout/i.test(e && e.message || "") ? "unavailable" : "unknown", e && e.message || "Erro na base.");
  function docRef(path) {
    return {
      id: lastOf(path), path,
      collection: (name) => colRef(`${path}/${name}`),
      async get() {
        const { data, error } = await sb.from("docs").select("data").eq("path", path).maybeSingle();
        if (error) throw dbErr(error);
        return { id: lastOf(path), exists: !!data, data: () => (data ? data.data : undefined) };
      },
      async set(value) {
        const { error } = await sb.from("docs").upsert({ path, parent: parentOf(path), data: value, updated_at: new Date().toISOString() });
        if (error) throw dbErr(error);
      },
      async delete() {
        const { error } = await sb.from("docs").delete().eq("path", path);
        if (error) throw dbErr(error);
      }
    };
  }
  function colRef(path) {
    return {
      path, doc: (id) => docRef(`${path}/${id}`),
      async get() {
        const out = []; let from = 0; const page = 500;
        for (;;) {
          const { data, error } = await sb.from("docs").select("path,data").eq("parent", path).range(from, from + page - 1);
          if (error) throw dbErr(error);
          out.push(...data); if (data.length < page) break; from += page;
        }
        return { docs: out.map((r) => ({ id: lastOf(r.path), data: () => r.data })) };
      }
    };
  }
  const db = Object.freeze({ doc: docRef, collection: colRef });

  /* ---------------- Usuário ---------------- */
  const user = Object.freeze({ id: async () => (session && session.user ? session.user.id : null), email: async () => (session && session.user ? session.user.email : null) });

  /* ---------------- Claude ---------------- */
  async function shrink(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const max = 1568, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (s === 1 && blob.size < 3.5e6 && /jpeg|png|webp|gif/.test(blob.type)) { bmp.close && bmp.close(); return blob; }
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
      return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    } catch (e) { return blob; }
  }
  const b64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  async function imagesPayload(list) {
    const out = [];
    for (const b of (list || []).slice(0, 20)) { const s = await shrink(b); out.push({ media_type: /png|webp|gif/.test(s.type) ? s.type : "image/jpeg", data: await b64(s) }); }
    return out;
  }
  const toMessages = (input) => typeof input === "string" ? [{ role: "user", content: input }] : (Array.isArray(input) ? input.map((m) => ({ role: m.role, content: String(m.content) })) : []);
  async function post(body, signal) {
    let res;
    try {
      res = await fetch(FN("claude"), { method: "POST", signal, headers: { Authorization: `Bearer ${await token()}`, apikey: CFG.supabaseAnonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      if (e && (e.name === "AbortError" || e.code === "session_expired")) throw e.name === "AbortError" ? err("cancelled", "Cancelado.") : e;
      throw err("upstream_error", "Sem conexão com o servidor.");
    }
    if (!res.ok) { let j = null; try { j = await res.json(); } catch (e) {} throw err((j && j.error && j.error.code) || (res.status === 429 ? "rate_limited" : "upstream_error"), (j && j.error && j.error.message) || "Erro no servidor."); }
    return res;
  }
  function parseJSON(text) {
    let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    const c = t.indexOf("["), d = t.lastIndexOf("]");
    if (c >= 0 && d > c) { try { return JSON.parse(t.slice(c, d + 1)); } catch (e) {} }
    throw err("invalid_json", "Resposta fora do formato.");
  }
  const tierOf = (o) => (o && o.modelTier) || "default";
  async function sample(input, o = {}) {
    const body = { messages: toMessages(input), tier: tierOf(o), stream: true, images: o.images ? await imagesPayload(o.images) : undefined };
    const res = await post(body, o.signal);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", text = "", stop = null;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (!line.startsWith("data:")) continue;
          let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
          if (ev.delta) { text += ev.delta; o.onText && o.onText({ text, delta: ev.delta }); }
          if (ev.error) throw err(ev.error.code || "upstream_error", ev.error.message || "", { text });
          if (ev.done) stop = ev.stop_reason;
        }
      }
    } catch (e) {
      if (e && e.name === "AbortError") throw err("cancelled", "Cancelado.", { text });
      if (e && e.code) throw Object.assign(e, { text });
      throw err("upstream_error", "A resposta foi interrompida.", { text });
    }
    if (!text.trim()) throw err("empty_completion", "Sem resposta.");
    return { text, truncated: stop === "max_tokens" };
  }
  sample.json = async (input, o = {}) => {
    const res = await post({ messages: toMessages(input), tier: tierOf(o), json: true, images: o.images ? await imagesPayload(o.images) : undefined }, o.signal);
    const j = await res.json();
    return parseJSON(j.text);
  };
  sample.limits = async () => ({ images: true, maxImages: 20 });
  Object.freeze(sample);

  /* ---------------- Transcrição (Whisper) ---------------- */
  async function transcribeBlob(blob, language, prompt, signal) {
    const fd = new FormData();
    const ext = /mp4|m4a|aac/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : /wav/.test(blob.type) ? "wav" : /mpeg|mp3/.test(blob.type) ? "mp3" : "webm";
    fd.append("file", blob, `trecho.${ext}`);
    if (language) fd.append("language", language.slice(0, 2));
    if (prompt) fd.append("prompt", prompt.slice(-500));
    let res;
    try { res = await fetch(FN("transcribe"), { method: "POST", signal, headers: { Authorization: `Bearer ${await token()}`, apikey: CFG.supabaseAnonKey }, body: fd }); }
    catch (e) { throw e && e.name === "AbortError" ? err("cancelled", "") : err("upstream_error", "Sem conexão para transcrever."); }
    if (!res.ok) { let j = null; try { j = await res.json(); } catch (e) {} throw err((j && j.error && j.error.code) || "upstream_error", (j && j.error && j.error.message) || "A transcrição falhou."); }
    return String((await res.json()).text || "");
  }
  const pickMime = () => {
    if (!window.MediaRecorder) return null;
    for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    return "";
  };

  /** Grava um MediaStream em trechos e transcreve cada um, em ordem. */
  function chunker(stream, { language, firstSec = 18, nextSec = 40, onText, onBusy, onError, level }) {
    const mime = pickMime();
    let rec = null, on = true, timer = null, queue = Promise.resolve(), ctxText = "", peak = 0, n = 0;
    const startOne = () => {
      const chunks = []; peak = 0;
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        const loud = level ? peak : 1;
        const blob = new Blob(chunks, { type: r.mimeType || mime || "audio/webm" });
        if (on) startOne();
        if (blob.size > 2000 && loud > 0.012) {
          onBusy && onBusy(true);
          queue = queue.then(() => transcribeBlob(blob, language, ctxText)).then((t) => { if (t.trim()) { ctxText = (ctxText + " " + t).slice(-600); onText(t.trim()); } }).catch((e) => onError && onError(e)).finally(() => onBusy && onBusy(false));
        }
      };
      r.start(); rec = r;
      clearTimeout(timer); timer = setTimeout(() => { if (on && rec && rec.state === "recording") rec.stop(); }, (n++ === 0 ? firstSec : nextSec) * 1000);
    };
    let meter = null;
    if (level) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaStreamSource(stream); const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
        const arr = new Float32Array(an.fftSize);
        meter = { ac, iv: setInterval(() => { an.getFloatTimeDomainData(arr); let s = 0; for (const v of arr) s += v * v; peak = Math.max(peak, Math.sqrt(s / arr.length)); }, 150) };
      } catch (e) { level = false; }
    }
    startOne();
    return {
      async stop() {
        on = false; clearTimeout(timer);
        if (rec && rec.state === "recording") { const done = new Promise((r) => { const prev = rec.onstop; rec.onstop = () => { prev(); r(); }; }); rec.stop(); await done; }
        if (meter) { clearInterval(meter.iv); try { meter.ac.close(); } catch (e) {} }
        await queue;
      }
    };
  }

  /* ---------------- Ditado (mesma interface do claude.ai) ---------------- */
  function makeDictation() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || pickMime() === null) return null;
    const h = { partial: [], final: [], state: [] };
    const emit = (k, v) => h[k].forEach((f) => { try { f(v); } catch (e) { console.error(e); } });
    let stream = null, ch = null, isOn = false, lock = null, busy = 0;
    const setState = (state, reason) => emit("state", { state, reason });
    const releaseLock = () => { try { lock && lock.release(); } catch (e) {} lock = null; };
    return Object.freeze({
      start(opts = {}) {
        if (isOn) return Promise.resolve();
        isOn = true; setState("starting");
        const p = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        return p.then(async (s) => {
          stream = s;
          s.getAudioTracks().forEach((t) => t.addEventListener("ended", () => { if (isOn) { isOn = false; releaseLock(); setState("idle", "hidden"); } }));
          try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch (e) {}
          ch = chunker(s, {
            language: opts.language || "pt", level: true,
            onText: (t) => { emit("partial", { text: "" }); emit("final", { text: " " + t }); },
            onBusy: (b) => { busy += b ? 1 : -1; emit("partial", { text: busy > 0 ? "…" : "" }); },
            onError: (e) => { emit("partial", { text: "" }); if (e && e.code === "rate_limited") { isOn = false; setState("idle", "rate_limited"); } }
          });
          setState("listening");
        }).catch((e) => {
          isOn = false; setState("idle", "not_granted");
          throw err(e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "not_granted" : "unavailable", "Microfone indisponível.");
        });
      },
      async stop() {
        if (!isOn && !ch) return;
        isOn = false; setState("stopping");
        const c = ch; ch = null;
        try { if (c) await c.stop(); } catch (e) {}
        if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null;
        releaseLock(); emit("partial", { text: "" }); setState("idle", "stopped");
      },
      active: () => isOn,
      onPartial: (f) => h.partial.push(f), onFinal: (f) => h.final.push(f), onState: (f) => h.state.push(f)
    });
  }

  /* ---------------- Transcrever arquivos de vídeo/áudio ---------------- */
  const transcriber = Object.freeze({
    /** Transcreve um arquivo. Arquivos pequenos vão inteiros; grandes são "ouvidos" em silêncio, acelerados, e cortados em trechos. */
    async file(file, { language = "pt", onProgress, signal } = {}) {
      if (file.size <= 15 * 1024 * 1024) {
        onProgress && onProgress(0.1, "Enviando o áudio…");
        const t = await transcribeBlob(file, language, "", signal);
        onProgress && onProgress(1, ""); return t;
      }
      if (pickMime() === null) throw err("unavailable", "Este navegador não consegue extrair o áudio de arquivos grandes.");
      const url = URL.createObjectURL(file);
      const el = document.createElement("video"); el.src = url; el.playsInline = true; el.preload = "auto"; el.crossOrigin = "anonymous";
      el.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0"; document.body.appendChild(el);
      try {
        await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(err("unavailable", "Não consegui abrir o arquivo.")); setTimeout(() => rej(err("unavailable", "O arquivo demorou demais para abrir.")), 20000); });
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const src = ac.createMediaElementSource(el), dest = ac.createMediaStreamDestination();
        src.connect(dest); // não liga às caixas de som: a captura é silenciosa
        const parts = [];
        const ch = chunker(dest.stream, { language, firstSec: 150, nextSec: 150, level: false, onText: (t) => parts.push(t), onError: (e) => { throw e; } });
        el.playbackRate = 1.5; if ("preservesPitch" in el) el.preservesPitch = true;
        await ac.resume(); await el.play();
        await new Promise((res, rej) => {
          const tick = setInterval(() => { onProgress && onProgress(Math.min(0.97, el.currentTime / (el.duration || 1)), `Ouvindo o vídeo em silêncio (${Math.round(100 * el.currentTime / (el.duration || 1))}%)…`); }, 1000);
          el.onended = () => { clearInterval(tick); res(); };
          el.onerror = () => { clearInterval(tick); rej(err("unavailable", "O vídeo parou de tocar.")); };
          if (signal) signal.addEventListener("abort", () => { clearInterval(tick); el.pause(); rej(err("cancelled", "")); });
        });
        onProgress && onProgress(0.98, "Terminando a transcrição…");
        await ch.stop(); try { ac.close(); } catch (e) {}
        onProgress && onProgress(1, "");
        return parts.join(" ");
      } finally { el.pause(); el.remove(); URL.revokeObjectURL(url); }
    }
  });

  /* ---------------- Voz (síntese do próprio aparelho) ---------------- */
  function makeTTS() {
    if (!window.speechSynthesis) return null;
    const hs = []; const emit = (v) => hs.forEach((f) => { try { f(v); } catch (e) {} });
    let token = 0;
    const voiceFor = (lang) => { const vs = speechSynthesis.getVoices(); const want = lang && lang.startsWith("en") ? "en" : "pt"; return vs.find((v) => v.lang.toLowerCase().startsWith(want === "pt" ? "pt-br" : "en-gb")) || vs.find((v) => v.lang.toLowerCase().startsWith(want)) || null; };
    return Object.freeze({
      async speak(text, o = {}) {
        speechSynthesis.cancel(); const my = ++token;
        const parts = String(text).match(/[^.!?\n]+[.!?]*\s*/g) || [String(text)];
        emit({ state: "speaking" });
        for (const p of parts) {
          if (my !== token) return;
          await new Promise((res) => { const u = new SpeechSynthesisUtterance(p); const v = voiceFor(o.language); if (v) u.voice = v; u.lang = o.language === "en" ? "en-GB" : "pt-BR"; u.rate = o.rate || 1; u.onend = res; u.onerror = res; speechSynthesis.speak(u); });
        }
        if (my === token) emit({ state: "idle", reason: "finished" });
      },
      stop() { token++; speechSynthesis.cancel(); emit({ state: "idle", reason: "stopped" }); },
      pause() { speechSynthesis.pause(); emit({ state: "paused" }); }, resume() { speechSynthesis.resume(); emit({ state: "speaking" }); },
      onState: (f) => hs.push(f)
    });
  }

  /* ---------------- window.claude.use ---------------- */
  const dictation = makeDictation(), tts = makeTTS();
  const table = { db, user, sample, dictation, tts, transcribe: transcriber };
  window.claude = Object.freeze({
    use: async (name) => {
      if (!ready) return null;
      await sessionReady;
      return Object.prototype.hasOwnProperty.call(table, name) ? table[name] : null;
    }
  });
})();
