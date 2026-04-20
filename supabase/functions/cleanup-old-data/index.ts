import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const metricsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const logsCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const httpResultsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const resolvedAlertsCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [metrics, logs, httpResults, alerts] = await Promise.all([
      supabase.from("server_metrics").delete().lt("recorded_at", metricsCutoff).select("id"),
      supabase.from("container_logs").delete().lt("recorded_at", logsCutoff).select("id"),
      supabase.from("http_check_results").delete().lt("recorded_at", httpResultsCutoff).select("id"),
      supabase.from("alerts").delete().eq("resolved", true).lt("resolved_at", resolvedAlertsCutoff).select("id"),
    ]);

    const result = {
      ok: true,
      deleted: {
        server_metrics: metrics.data?.length ?? 0,
        container_logs: logs.data?.length ?? 0,
        http_check_results: httpResults.data?.length ?? 0,
        resolved_alerts: alerts.data?.length ?? 0,
      },
      cutoffs: {
        metrics: metricsCutoff,
        logs: logsCutoff,
        http_results: httpResultsCutoff,
        resolved_alerts: resolvedAlertsCutoff,
      },
    };

    console.log("[cleanup]", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cleanup error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
