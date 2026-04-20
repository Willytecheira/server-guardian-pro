import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface MetricsPayload {
  hostname?: string;
  os?: string;
  agent_version?: string;
  metrics?: {
    cpu_percent?: number;
    ram_percent?: number;
    ram_used_mb?: number;
    ram_total_mb?: number;
    disk_percent?: number;
    disk_used_gb?: number;
    disk_total_gb?: number;
    net_rx_bytes?: number;
    net_tx_bytes?: number;
    load_1?: number;
    load_5?: number;
    load_15?: number;
    uptime_seconds?: number;
  };
  containers?: Array<{
    container_id: string;
    name: string;
    image?: string;
    status?: string;
    state?: string;
    cpu_percent?: number;
    ram_mb?: number;
    restart_count?: number;
    started_at?: string;
  }>;
  logs?: Array<{
    container_name: string;
    level?: string;
    message: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token =
      req.headers.get("x-ingest-token") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return json({ error: "Missing ingest token" }, 401);
    }

    const { data: server, error: srvErr } = await supabase
      .from("servers")
      .select("id, name")
      .eq("ingest_token", token)
      .maybeSingle();

    if (srvErr || !server) {
      return json({ error: "Invalid token" }, 401);
    }

    const body: MetricsPayload = await req.json().catch(() => ({}));

    // Update server presence
    const serverPatch: Record<string, unknown> = {
      status: "online",
      last_seen_at: new Date().toISOString(),
    };
    if (body.hostname) serverPatch.hostname = body.hostname;
    if (body.os) serverPatch.os = body.os;
    if (body.agent_version) serverPatch.agent_version = body.agent_version;

    await supabase.from("servers").update(serverPatch).eq("id", server.id);

    // Insert metrics row
    if (body.metrics) {
      await supabase.from("server_metrics").insert({
        server_id: server.id,
        ...body.metrics,
      });
    }

    // Upsert containers
    if (Array.isArray(body.containers) && body.containers.length > 0) {
      const rows = body.containers.map((c) => ({
        server_id: server.id,
        container_id: c.container_id,
        name: c.name,
        image: c.image ?? null,
        status: c.status ?? null,
        state: c.state ?? null,
        cpu_percent: c.cpu_percent ?? null,
        ram_mb: c.ram_mb ?? null,
        restart_count: c.restart_count ?? 0,
        started_at: c.started_at ?? null,
        updated_at: new Date().toISOString(),
      }));
      await supabase
        .from("docker_containers")
        .upsert(rows, { onConflict: "server_id,container_id" });

      // Cleanup containers no longer reported
      const reportedIds = body.containers.map((c) => c.container_id);
      await supabase
        .from("docker_containers")
        .delete()
        .eq("server_id", server.id)
        .not("container_id", "in", `(${reportedIds.map((i) => `"${i}"`).join(",")})`);
    }

    // Insert logs
    if (Array.isArray(body.logs) && body.logs.length > 0) {
      await supabase.from("container_logs").insert(
        body.logs.slice(0, 100).map((l) => ({
          server_id: server.id,
          container_name: l.container_name,
          level: l.level ?? "info",
          message: l.message,
        })),
      );
    }

    return json({ ok: true, server_id: server.id });
  } catch (e) {
    console.error("ingest error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
