// Hestia for Claude: an MCP server (Streamable HTTP, stateless) over the tools of ../_shared/registry.ts.
// Add it in Claude as a custom connector:  https://<project>.supabase.co/functions/v1/mcp?cle=<token>
// The token is personal (it says who is asking, so the activity log stays truthful): each adult creates theirs in the
// app, Réglages › Connecteur Claude. It can also come as "Authorization: Bearer <token>". Optional: &tz=Europe/Paris.
// See docs/MCP.md.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { householdTz, loadMembers } from "../_shared/db.ts";
import { CORS, preflight, rememberFunctionsUrl } from "../_shared/http.ts";
import { type Ctx, instructions, runTool, tools } from "../_shared/registry.ts";
import { db, env } from "../_shared/runtime.ts";
import { validTz } from "../_shared/time.ts";

const refuse = (message: string, status = 401) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha256(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  // No session, so no stream to keep open (GET) nor to close (DELETE)
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  const url = new URL(req.url);
  const candidates = [url.searchParams.get("cle"), url.searchParams.get("key"), (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")]
    .filter((t): t is string => !!t && t.startsWith("hst_"));
  if (!candidates.length) return refuse("Jeton manquant : ajoute ?cle=<jeton> à l'adresse (Hestia › Réglages › Connecteur Claude).");
  const hashes = await Promise.all(candidates.map(sha256));
  const token = await db.one(`select id, member_id from private.mcp_tokens where token_sha256 = any (string_to_array($1, ',')) and revoked_at is null limit 1`, [hashes.join(",")]);
  if (!token) return refuse("Jeton inconnu ou révoqué.");
  db.exec(`update private.mcp_tokens set last_used_at = now() where id = $1::uuid`, [token.id]).catch(() => {});
  await rememberFunctionsUrl(db, env);

  const members = await loadMembers(db);
  const c: Ctx = {
    db, members, via: "mcp", now: () => Date.now(),
    actor: members.find((m) => m.id === token.member_id) ?? null,
    tz: url.searchParams.get("tz") ? validTz(url.searchParams.get("tz")) : await householdTz(db),
  };
  const server = new McpServer({ name: "hestia", title: "Hestia", version: "1.0.0" }, { instructions: await instructions(c) });
  for (const t of tools) {
    server.registerTool(t.name, {
      title: t.title, description: t.description, inputSchema: t.shape,
      annotations: { readOnlyHint: !t.write, destructiveHint: false, openWorldHint: false },
    }, async (args: unknown) => {
      const r = await runTool(t.name, args, c);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.error };
    });
  }
  // Every request stands alone and is answered in plain JSON
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
});
