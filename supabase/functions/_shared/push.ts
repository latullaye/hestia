// Web Push: the VAPID keys (made on first use; the private half never leaves the database) and sending to a member's devices.
import webpush from "web-push";
import { type Db, config, setConfig } from "./db.ts";

export async function vapid(db: Db): Promise<{ publicKey: string; privateKey: string }> {
  let publicKey = await config(db, "vapid_public"), privateKey = await config(db, "vapid_private");
  if (!publicKey || !privateKey) {
    const k = webpush.generateVAPIDKeys();
    await db.exec(`insert into private.config (key, value) values ('vapid_public', $1), ('vapid_private', $2) on conflict (key) do nothing`, [k.publicKey, k.privateKey]);
    publicKey = await config(db, "vapid_public"); privateKey = await config(db, "vapid_private");
  }
  return { publicKey: publicKey!, privateKey: privateKey! };
}

export type PushPayload = {
  title: string; body?: string; url?: string; tag?: string; kind?: string;
  token?: string;                                   // lets the notification's buttons act (see functions/notify)
  actions?: { action: string; title: string }[];
};

// Sends to every device of these members; forgets the devices that are gone. Returns how many were reached.
export async function sendPush(db: Db, memberIds: string[], payload: PushPayload, subject: string): Promise<{ sent: number; errors: string[] }> {
  const subs = await db.all(`select id, endpoint, subscription from public.push_subscriptions where member_id = any ($1::text::uuid[])`, [`{${memberIds.join(",")}}`]);
  if (!subs.length) return { sent: 0, errors: [] };
  const { publicKey, privateKey } = await vapid(db);
  webpush.setVapidDetails(subject, publicKey, privateKey);
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.exec(`delete from public.push_subscriptions where id = $1::uuid`, [s.id]); // the app was removed or reinstalled
      else errors.push(`${code ?? ""} ${(e as Error).message}`.slice(0, 200));
    }
  }
  return { sent, errors };
}
export { setConfig };
