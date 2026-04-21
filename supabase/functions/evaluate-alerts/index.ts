import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TG_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Rule = {
  id: string;
  metric: "cpu_percent" | "ram_percent" | "disk_percent" | "offline";
  operator: ">" | ">=" | "<" | "<=" | "=";
  threshold: number;
  duration_minutes: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  name: string;
};

type Server = {
  id: string;
  name: string;
  status: string;
  last_seen_at: string | null;
};

function compare(value: number, op: Rule["operator"], threshold: number): boolean {
  switch (op) {
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case "=": return value === threshold;
  }
}

async function sendTelegram(chatId: string, text: string) {
  const lk = Deno.env.get("LOVABLE_API_KEY");
  const tk = Deno.env.get("TELEGRAM_API_KEY") ?? Deno.env.get("TELEGRAM_API_KEY_1");
  if (!lk || !tk) {
    console.warn("Telegram secrets missing", { hasLk: !!lk, hasTk: !!tk });
    return;
  }
  const resp = await fetch(`${TG_GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lk}`,
      "X-Connection-Api-Key": tk,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Telegram send failed", resp.status, t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const now = Date.now();

    const [rulesRes, serversRes, settingsRes] = await Promise.all([
      supabase.from("alert_rules").select("*").eq("enabled", true),
      supabase.from("servers").select("id, name, status, last_seen_at"),
      supabase.from("notification_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    const rules = (rulesRes.data ?? []) as Rule[];
    const servers = (serversRes.data ?? []) as Server[];
    const settings = settingsRes.data as { telegram_enabled: boolean; telegram_chat_id: string | null } | null;

    const tgEnabled = !!(settings?.telegram_enabled && settings?.telegram_chat_id);
    const tgChatId = settings?.telegram_chat_id ?? "";

    let triggered = 0;
    let resolved = 0;
    const notifications: string[] = [];

    // Mark servers offline (>2 min without report)
    const offlineCutoff = new Date(now - 2 * 60 * 1000).toISOString();
    const onlineCutoff = new Date(now - 2 * 60 * 1000).toISOString();
    for (const s of servers) {
      const isStale = !s.last_seen_at || s.last_seen_at < offlineCutoff;
      if (isStale && s.status !== "offline") {
        await supabase.from("servers").update({ status: "offline" }).eq("id", s.id);
        s.status = "offline";
      } else if (!isStale && s.status === "offline") {
        await supabase.from("servers").update({ status: "online" }).eq("id", s.id);
        s.status = "online";
      }
    }

    for (const rule of rules) {
      for (const server of servers) {
        let conditionMet = false;
        let currentValue: number | null = null;

        if (rule.metric === "offline") {
          // duration handled directly: server has been offline more than threshold minutes
          const minutesOffline = server.last_seen_at
            ? (now - new Date(server.last_seen_at).getTime()) / 60000
            : Number.POSITIVE_INFINITY;
          currentValue = Math.round(minutesOffline);
          conditionMet = compare(minutesOffline, rule.operator, rule.threshold);
        } else {
          // Look at metrics in the duration window; require ALL samples to violate
          const windowStart = new Date(now - rule.duration_minutes * 60 * 1000).toISOString();
          const { data: rows } = await supabase
            .from("server_metrics")
            .select(rule.metric + ", recorded_at")
            .eq("server_id", server.id)
            .gte("recorded_at", windowStart)
            .order("recorded_at", { ascending: false });

          const samples = (rows ?? [])
            .map((r: any) => Number(r[rule.metric]))
            .filter((n) => Number.isFinite(n));

          if (samples.length === 0) {
            conditionMet = false;
          } else {
            currentValue = samples[0];
            conditionMet = samples.every((v) => compare(v, rule.operator, rule.threshold));
            // Require at least 2 samples for non-zero duration to avoid one-off spikes
            if (rule.duration_minutes > 0 && samples.length < 2) conditionMet = false;
          }
        }

        // Read previous state
        const { data: stateRow } = await supabase
          .from("alert_rule_state")
          .select("*")
          .eq("server_id", server.id)
          .eq("rule_id", rule.id)
          .maybeSingle();

        const wasTriggered = !!stateRow?.triggered_at;

        if (conditionMet && !wasTriggered) {
          // Create alert
          const title = `${rule.name} — ${server.name}`;
          const message =
            rule.metric === "offline"
              ? `Sin reportar hace ${currentValue} min`
              : `${rule.metric.replace("_percent", "").toUpperCase()} = ${currentValue}% (umbral ${rule.operator}${rule.threshold}%)`;

          const { data: alertRow } = await supabase
            .from("alerts")
            .insert({
              server_id: server.id,
              severity: rule.severity,
              title,
              message,
            })
            .select("id")
            .single();

          await supabase.from("alert_rule_state").upsert({
            server_id: server.id,
            rule_id: rule.id,
            triggered_at: new Date().toISOString(),
            last_alert_id: alertRow?.id ?? null,
            updated_at: new Date().toISOString(),
          });

          triggered++;
          if (tgEnabled) {
            const sevIcon = rule.severity === "critical" ? "🚨" : rule.severity === "warning" ? "⚠️" : "ℹ️";
            notifications.push(`${sevIcon} <b>${title}</b>\n${message}`);
          }
        } else if (!conditionMet && wasTriggered) {
          // Resolve alert
          if (stateRow?.last_alert_id) {
            await supabase
              .from("alerts")
              .update({ resolved: true, resolved_at: new Date().toISOString() })
              .eq("id", stateRow.last_alert_id);
          }
          await supabase
            .from("alert_rule_state")
            .update({ triggered_at: null, last_alert_id: null, updated_at: new Date().toISOString() })
            .eq("server_id", server.id)
            .eq("rule_id", rule.id);

          resolved++;
          if (tgEnabled) {
            notifications.push(`✅ <b>Resuelto:</b> ${rule.name} — ${server.name}`);
          }
        }
      }
    }

    // Send telegram notifications (one message, batched)
    if (tgEnabled && notifications.length > 0) {
      const text = notifications.join("\n\n");
      await sendTelegram(tgChatId, text);
    }

    const result = { ok: true, triggered, resolved, rules: rules.length, servers: servers.length };
    console.log("[evaluate-alerts]", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evaluate-alerts error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
