import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Activity, Box, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatPercent, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ServerRow {
  id: string;
  name: string;
  hostname: string | null;
  status: string;
  last_seen_at: string | null;
}

interface LatestMetric {
  server_id: string;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
}

const Dashboard = () => {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, LatestMetric>>({});
  const [containerCount, setContainerCount] = useState(0);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: srv } = await supabase
      .from("servers")
      .select("id, name, hostname, status, last_seen_at")
      .order("created_at", { ascending: true });
    setServers(srv ?? []);

    if (srv && srv.length) {
      // Fetch latest metric per server (simple approach: query latest 1 per id)
      const map: Record<string, LatestMetric> = {};
      await Promise.all(
        srv.map(async (s) => {
          const { data } = await supabase
            .from("server_metrics")
            .select("server_id, cpu_percent, ram_percent, disk_percent")
            .eq("server_id", s.id)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) map[s.id] = data;
        }),
      );
      setMetrics(map);
    }

    const { count: cc } = await supabase
      .from("docker_containers")
      .select("*", { count: "exact", head: true });
    setContainerCount(cc ?? 0);

    const { count: ac } = await supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("resolved", false);
    setOpenAlerts(ac ?? 0);

    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "servers" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "server_metrics" }, load)
      .subscribe();
    const interval = setInterval(load, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const onlineCount = servers.filter((s) => s.status === "online").length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Estado general de tu infraestructura</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Server} label="Servidores" value={`${onlineCount}/${servers.length}`} hint="online" />
        <StatCard icon={Box} label="Contenedores" value={String(containerCount)} hint="reportados" />
        <StatCard icon={AlertTriangle} label="Alertas abiertas" value={String(openAlerts)} tone={openAlerts > 0 ? "warning" : "success"} />
        <StatCard icon={Activity} label="Estado global" value={openAlerts > 0 ? "Atención" : "Saludable"} tone={openAlerts > 0 ? "warning" : "success"} />
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Servidores</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : servers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Server className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-1">No tienes servidores registrados</p>
              <Link to="/settings" className="text-sm text-primary hover:underline">
                Añade tu primer servidor
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {servers.map((s) => {
              const m = metrics[s.id];
              const online = s.status === "online";
              return (
                <Link key={s.id} to={`/servers/${s.id}`}>
                  <Card className="hover:border-primary/50 transition-colors h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          {online ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          {s.name}
                        </CardTitle>
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            online ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {s.status}
                        </span>
                      </div>
                      {s.hostname && <p className="text-xs text-muted-foreground">{s.hostname}</p>}
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <MetricBar label="CPU" value={m?.cpu_percent} />
                      <MetricBar label="RAM" value={m?.ram_percent} />
                      <MetricBar label="Disco" value={m?.disk_percent} />
                      <p className="text-xs text-muted-foreground pt-1">
                        Último reporte: {relativeTime(s.last_seen_at)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Server;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning";
}) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center",
          tone === "success" && "bg-success/10 text-success",
          tone === "warning" && "bg-warning/10 text-warning",
          tone === "default" && "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </CardContent>
  </Card>
);

const MetricBar = ({ label, value }: { label: string; value: number | null | undefined }) => {
  const pct = value == null ? 0 : Math.min(100, Number(value));
  const tone = pct >= 85 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-primary";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{formatPercent(value)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default Dashboard;
