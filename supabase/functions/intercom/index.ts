// The intercom: a sentence said to the kitchen kiosk or to a phone ("il faut acheter des œufs", "qui cuisine ce soir ?")
// becomes actions, through the same tools as the MCP server (../_shared/registry.ts). The speech is turned into text
// on the device; this function receives the text, lets Claude use the tools, and answers with one or two sentences made
// to be read aloud.
// POST { text, acting_member_id?, history?: [{ role: "user" | "assistant", text }] } with the app's user token.
// The Anthropic key is the function secret ANTHROPIC_API_KEY (or the row anthropic_api_key of private.config).
import Anthropic from "@anthropic-ai/sdk";
import { config, householdTz } from "../_shared/db.ts";
import { json, memberFromToken, preflight, rememberFunctionsUrl } from "../_shared/http.ts";
import { type Ctx, anthropicTools, instructions, runTool } from "../_shared/registry.ts";
import { db, env } from "../_shared/runtime.ts";
import { fmtDay, fmtTime, partsIn } from "../_shared/time.ts";

const MODEL = env("HESTIA_MODEL") || "claude-opus-5-5";
const MAX_TURNS = 8;
const VOICE = [
  "Tu es l'interphone de la maison. On te parle à voix haute, depuis le kiosque de la cuisine ou un téléphone ; le texte vient d'une reconnaissance vocale et peut contenir des erreurs : interprète avec bon sens (noms de plats, prénoms, articles).",
  "Agis tout de suite avec les outils, sans demander de confirmation pour ce qui est simple et réversible (courses, repas, tâches, événements). Si la demande est vraiment ambiguë, pose une seule question courte.",
  "Ta réponse est lue à voix haute et affichée en gros : une ou deux phrases courtes, en français du Québec, naturelles, sans Markdown, sans liste, sans identifiant technique. Dis ce que tu as fait ou la réponse à la question, rien de plus.",
].join("\n");
const MESSAGES: Record<string, string> = {
  auth: "Connecte-toi pour utiliser l'interphone.",
  key: "L'interphone n'est pas encore branché : la clé Anthropic manque.",
  busy: "L'interphone est très demandé en ce moment. Réessaie dans une minute.",
  api: "L'interphone ne répond pas pour le moment.",
  refusal: "Je ne peux pas aider pour cette demande.",
  empty: "Je n'ai rien entendu.",
};

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const who = await memberFromToken(req, db, env);
  if (!who) return json({ error: "auth", reply: MESSAGES.auth }, 401);
  await rememberFunctionsUrl(db, env);

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim().slice(0, 2000);
  if (!text) return json({ error: "empty", reply: MESSAGES.empty }, 400);
  // On the kiosk, the person who spoke is the one picked on the screen, if any
  const onKiosk = who.member.role === "device";
  const actor = onKiosk ? who.members.find((m) => m.id === body.acting_member_id && m.role !== "device") ?? null : who.member;
  const tz = await householdTz(db);
  const c: Ctx = { db, members: who.members, actor, via: "intercom", tz, now: () => Date.now() };

  const apiKey = await config(db, "anthropic_api_key", env);
  if (!apiKey) return json({ error: "key", reply: MESSAGES.key }, 503);
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });

  const now = partsIn(Date.now(), tz);
  const context = `[Nous sommes ${fmtDay(now.day, { weekday: "long", month: "long", year: "numeric" })} (${now.day}), il est ${fmtTime(now.time, tz)}. `
    + `${actor ? `C'est ${actor.name} qui parle` : "On ne sait pas qui parle"}${onKiosk ? ", au kiosque de la cuisine" : ""}.]`;
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .filter((h: { role?: string; text?: string }) => (h.role === "user" || h.role === "assistant") && typeof h.text === "string" && h.text.trim())
    .map((h: { role: "user" | "assistant"; text: string }) => ({ role: h.role, content: h.text.slice(0, 2000) }));
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: `${context}\n\n${text}` }];
  // The system prompt and the tools do not change from one request to the next: they are cached
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: `${VOICE}\n\n${await instructions(c)}`, cache_control: { type: "ephemeral" } }];
  const tools = anthropicTools() as Anthropic.Beta.BetaToolUnion[];

  const t0 = Date.now(), used: { name: string; ok: boolean; text: string }[] = [];
  let reply = "", model = MODEL, tokensIn = 0, tokensOut = 0, error: string | null = null, changed = false;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4096,
        // If the model declines, the API re-runs the request on Anthropic's recommended fallback model
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" }, // short spoken exchanges: speed first
        system, tools, messages,
      });
      model = msg.model; tokensIn += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0); tokensOut += msg.usage.output_tokens;
      if (msg.stop_reason === "refusal") { error = "refusal"; reply = MESSAGES.refusal; break; }
      const said = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
      if (msg.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: msg.content }); continue; }
      const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || !calls.length) { reply = said; break; }
      messages.push({ role: "assistant", content: msg.content }); // thinking blocks included, unchanged
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        const r = await runTool(call.name, call.input, c);
        used.push({ name: call.name, ok: !r.error, text: r.text.slice(0, 500) });
        if (r.write && !r.error) changed = true;
        results.push({ type: "tool_result", tool_use_id: call.id, content: r.text, is_error: r.error });
      }
      messages.push({ role: "user", content: results });
      if (turn === MAX_TURNS - 1) reply = said || "C'est fait.";
    }
  } catch (e) {
    error = e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "key"
      : e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529) ? "busy" : "api";
    console.error("intercom", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e));
    reply = MESSAGES[error];
  }
  if (!reply) reply = used.length ? "C'est fait." : "Je n'ai pas compris.";
  const ms = Date.now() - t0;
  await db.exec(
    `insert into public.intercom_log (member_id, device, text, reply, tools, model, input_tokens, output_tokens, ms, error)
     values ($1::uuid, $2, $3, $4, $5::text::jsonb, $6, $7, $8, $9, $10)`,
    [actor?.id ?? null, onKiosk ? "kiosk" : "app", text, reply, JSON.stringify(used), model, tokensIn, tokensOut, ms, error]).catch((e) => console.error("intercom log", e));
  return json({ reply, changed, tools: used.map((u) => ({ name: u.name, ok: u.ok })), error, ms }, error === "key" || error === "busy" || error === "api" ? 503 : 200);
});
