import { createAdminClient } from "@/lib/supabase/admin";
import { generateVisits } from "@/lib/visits";
import type { Subscription } from "@/lib/types";

/** Daily: keep upcoming visits generated for every active subscription. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createAdminClient();
  let processed = 0;
  let failed = 0;
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .order("id")
      .range(page * 500, page * 500 + 499);
    if (error) return new Response(error.message, { status: 500 });
    for (const sub of (data ?? []) as Subscription[]) {
      try {
        await generateVisits(db, sub);
        processed++;
      } catch (err) {
        failed++;
        console.error("generate-visits failed for", sub.id, err);
      }
    }
    if (!data || data.length < 500) break;
  }
  return Response.json({ processed, failed });
}
