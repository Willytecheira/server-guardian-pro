import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Server as ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatBytes, formatPercent, formatUptime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ServerInfo {
  id: string;
  name: string;
  hostname: string | null;
  os: string | null;
  status: string;
  last_seen_at: string | null;
  agent_version: string | null;
}

interface Metric {
  recorded_at: string;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  ram_used_mb: number | null;
  ram_total_mb: number | null;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  load_1: number | null;
  load_5: number | null;
  load_15: number | null;
  uptime_seconds: number | null;
  net_rx_bytes: number | null;
  net_tx_bytes: number | null;
}

interface Container {
  id: string;
  container_id: string;
  name: string;
  image: string | null;
  status: string | null;
  state: string | null;
  cpu_percent: number | null;
  ram_mb: number | null;
  restart_count: number | null;
}

const ServerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);

  const load = async () => {
    if (!id) return;
    const [{ data: s }, { data: m }, { data: c }] = await Promise.all([
      supabase.from("servers").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("server_metrics")
        .select("*")
        .eq("server_id", id)
        .order("recorded_at", { ascending: false })
        .limit(60),
      supabase.from("docker_containers").select("*").eq("server_id", id).order("name"),
    ]);
    setServer(s);
    setMetrics((m ?? []).reverse());
    setContainers(c ?? []);
  };

  useEffect(() => {
    load();
    if (!id) return;
    const ch = supabase
      .channel(`server-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "server_metrics", filter: `server_id=eq.${id}` },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "docker_containers", filter: `server_id=eq.${id}` },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "servers", filter: `id=eq.${id}` },
        load,
      )
      .subscribe();
    const t = setInterval(load, 15000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [id]);

  if (!server) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;
  }

  const last = metrics[metrics.length - 1];
  const chartData = metrics.map((x) => ({
    time: new Date(x.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    cpu: x.cpu_percent != null ? Number(x.cpu_percent) : null,
    ram: x.ram_percent != null ? Number(x.ram_percent) : null,
    disk: x.disk_percent != null ? Number(x.disk_percent) : null,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/servers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ServerIcon className="h-5 w-5" />
            {server.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {server.hostname ?? "—"} · {server.os ?? "OS desconocido"} · agente {server.agent_version ?? "—"}
          </p>
        </div>
        <span
          className={cn(
            "text-xs px-2.5 py-1 rounded-full",
            server.status === "online"
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {server.status} · {relativeTime(server.last_seen_at)}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="CPU" value={formatPercent(last?.cpu_percent)} />
        <Stat
          label="RAM"
          value={formatPercent(last?.ram_percent)}
          sub={
            last?.ram_used_mb != null && last?.ram_total_mb != null
              ? `${(last.ram_used_mb / 1024).toFixed(1)} / ${(last.ram_total_mb / 1024).toFixed(1)} GB`
              : undefined
          }
        />
        <Stat
          label="Disco"
          value={formatPercent(last?.disk_percent)}
          sub={
            last?.disk_used_gb != null && last?.disk_total_gb != null
              ? `${Number(last.disk_used_gb).toFixed(0)} / ${Number(last.disk_total_gb).toFixed(0)} GB`
              : undefined
          }
        />
        <Stat
          label="Uptime"
          value={formatUptime(last?.uptime_seconds)}
          sub={
            last?.load_1 != null
              ? `load ${Number(last.load_1).toFixed(2)} · ${Number(last.load_5 ?? 0).toFixed(2)} · ${Number(last.load_15 ?? 0).toFixed(2)}`
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uso en el tiempo</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Aún no hay métricas. Instala el agente para empezar a recibir datos.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="cpu" name="CPU %" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ram" name="RAM %" stroke="hsl(var(--warning))" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="disk" name="Disco %" stroke="hsl(var(--success))" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contenedores Docker ({containers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {containers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No hay contenedores reportados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Imagen</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>RAM</TableHead>
                  <TableHead>Restarts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{c.image}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          c.state === "running"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {c.state ?? c.status ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>{formatPercent(c.cpu_percent)}</TableCell>
                    <TableCell>{c.ram_mb != null ? formatBytes(c.ram_mb * 1024 * 1024) : "—"}</TableCell>
                    <TableCell>{c.restart_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

export default ServerDetail;
