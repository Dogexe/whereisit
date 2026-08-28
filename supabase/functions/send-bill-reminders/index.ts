// Runs once a day (see the "send-bill-reminders-daily" pg_cron job in
// supabase/migrations/20260828120000_bill_reminders_push.sql), which is
// what actually gives bill reminders anywhere to run at all -- GitHub
// Pages is static, there is no server otherwise.
//
// Queries every user's bills with the service-role key (bypassing RLS is
// legitimate and necessary here: this is a backend batch job over *all*
// users, not a request scoped to one signed-in user), works out which
// ones need a nudge today, and sends a Web Push notification to every
// subscribed device for that bill's owner.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- Bill due-date logic -----------------------------------------------
// A faithful port of src/derived.js's nextBillDueDate/daysUntilBillDue/
// billDueCycle -- keep these two in sync if that algorithm ever changes.
// See derived.js's own doc comment for the full reasoning (why an unpaid
// bill holds on its current cycle instead of rolling forward, and why
// "overdue" resets at the next cycle rather than accumulating forever).
// Deno's system clock is UTC; `now` is shifted +7h by the caller so every
// date computed here reads as Thailand wall-clock time instead, keeping
// day boundaries ("today", "tomorrow") aligned with where this app's
// users actually are, not an arbitrary UTC midnight.
function monthKeyOf(date: Date): string {
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
}
function nextBillDueDate(day: number, lastPaidCycle: string | null, now: Date): Date {
  const dueYear = now.getUTCFullYear(), dueMonth = now.getUTCMonth();
  const lastDayOfThisMonth = new Date(Date.UTC(dueYear, dueMonth + 1, 0)).getUTCDate();
  const thisCycleDate = new Date(Date.UTC(dueYear, dueMonth, Math.min(day, lastDayOfThisMonth)));
  if (lastPaidCycle !== monthKeyOf(thisCycleDate)) return thisCycleDate;
  let nextMonth = dueMonth + 1, nextYear = dueYear;
  if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
  const lastDayOfNextMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(nextYear, nextMonth, Math.min(day, lastDayOfNextMonth)));
}
function daysUntilBillDue(day: number, lastPaidCycle: string | null, now: Date): number {
  const due = nextBillDueDate(day, lastPaidCycle, now);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}
function billDueCycle(day: number, lastPaidCycle: string | null, now: Date): string {
  return monthKeyOf(nextBillDueDate(day, lastPaidCycle, now));
}

function thbAmount(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Thai only -- there's no stored per-user language preference to pick
// from server-side (state.lang is a client-only, localStorage-backed
// setting, never synced), and Thai is this app's default/primary
// audience. Revisit if push_subscriptions ever grows a lang column.
function reminderText(name: string, amount: number, daysUntil: number): { title: string; body: string } {
  const amt = thbAmount(amount);
  if (daysUntil < 0) {
    const n = -daysUntil;
    return { title: "เกินกำหนดจ่าย", body: `${name} เกินกำหนด ${n} วันแล้ว (${amt})` };
  }
  if (daysUntil === 0) return { title: "ถึงกำหนดจ่ายวันนี้", body: `${name} (${amt})` };
  return { title: "ถึงกำหนดจ่ายพรุ่งนี้", body: `${name} (${amt})` };
}

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: vapidRows, error: vapidErr } = await supabase.rpc("get_vapid_keys");
  if (vapidErr || !vapidRows || !vapidRows[0]) {
    return new Response(JSON.stringify({ error: "vapid_keys_unavailable", detail: vapidErr?.message }), { status: 500 });
  }
  const { public_key, private_key } = vapidRows[0];
  // Subject can be a URL instead of mailto: -- used here since there's no
  // dedicated, monitored contact address for this project to put in a
  // mailto: link instead.
  webpush.setVapidDetails("https://github.com/Dogexe/whereisit", public_key, private_key);

  const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // see the doc comment above nextBillDueDate

  const { data: allBills, error: billsErr } = await supabase
    .from("bills")
    .select("id, user_id, name, amount, day, last_paid_cycle, last_notified_cycle")
    .eq("deleted", false);
  if (billsErr) return new Response(JSON.stringify({ error: "bills_query_failed", detail: billsErr.message }), { status: 500 });

  const dueBills = (allBills || [])
    .map((b) => {
      const daysUntil = daysUntilBillDue(b.day, b.last_paid_cycle, now);
      const dueCycle = billDueCycle(b.day, b.last_paid_cycle, now);
      return { ...b, daysUntil, dueCycle };
    })
    // <= 1 (tomorrow, today, or overdue) and not already notified for
    // this specific cycle -- send-once-per-cycle is what keeps this from
    // nagging a bill that sits overdue for weeks.
    .filter((b) => b.daysUntil <= 1 && b.last_notified_cycle !== b.dueCycle);

  if (dueBills.length === 0) {
    return new Response(JSON.stringify({ sent: 0, bills_due: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  const userIds = Array.from(new Set(dueBills.map((b) => b.user_id).filter(Boolean)));
  const { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subsErr) return new Response(JSON.stringify({ error: "subscriptions_query_failed", detail: subsErr.message }), { status: 500 });

  const subsByUser = new Map<string, typeof subs>();
  for (const s of subs || []) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id)!.push(s);
  }

  let sent = 0, failed = 0, pruned = 0;
  for (const bill of dueBills) {
    const targets = subsByUser.get(bill.user_id) || [];
    if (targets.length === 0) continue; // nothing to send to -- don't consume last_notified_cycle, see below
    const { title, body } = reminderText(bill.name, Number(bill.amount), bill.daysUntil);
    const payload = JSON.stringify({ title, body, billId: bill.id });
    let attempted = false;
    for (const sub of targets) {
      attempted = true;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        const statusCode = err && typeof err === "object" && "statusCode" in err ? (err as { statusCode: number }).statusCode : null;
        // 404/410: the browser/OS has permanently invalidated this
        // subscription (uninstalled, permission revoked at the OS level,
        // etc.) -- standard Web Push hygiene is to delete it rather than
        // retry it forever.
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          pruned++;
        }
      }
    }
    // Only mark this cycle notified if a send was actually attempted --
    // if the user had zero subscriptions this run, leave last_notified_cycle
    // alone so a later sign-up this same cycle still gets a reminder
    // instead of silently missing it forever.
    if (attempted) {
      await supabase.from("bills").update({ last_notified_cycle: bill.dueCycle }).eq("id", bill.id);
    }
  }

  return new Response(
    JSON.stringify({ bills_due: dueBills.length, sent, failed, pruned_subscriptions: pruned }),
    { headers: { "Content-Type": "application/json" } }
  );
});
