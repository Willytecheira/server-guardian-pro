import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Plus, Trash2, KeyRound, Download, Terminal } from "lucide-react";
import { toast } from "sonner";

interface ServerRow {
  id: string;
  name: string;
  hostname: string | null;
  ingest_token: string;
  created_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest-metrics`;
const INSTALLER_URL = `${SUPABASE_URL}/functions/v1/agent-installer`;

const Settings = () => {
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [rows, setRows] = useState<ServerRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [showTokenFor, setShowTokenFor] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("servers")
      .select("id, name, hostname, ingest_token, created_at")
      .order("created_at", { ascending: true });
    setRows(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("servers")
      .insert({ name: name.trim(), hostname: hostname.trim() || null, created_by: u.user?.id })
      .select("id")
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Servidor creado");
      setName("");
      setHostname("");
      if (data) setShowTokenFor(data.id);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este servidor y todos sus datos?")) return;
    const { error } = await supabase.from("servers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Eliminado");
      load();
    }
  };

  const copy = (text: string, label = "Copiado") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const installOneLiner = (token: string) =>
    `curl -fsSL "${INSTALLER_URL}?file=install.sh&token=${token}" | sudo bash`;

  const downloadInstaller = async (token: string, name: string) => {
    const res = await fetch(`${INSTALLER_URL}?file=install.sh&token=${token}`);
    const text = await res.text();
    const blob = new Blob([text], { type: "text/x-shellscript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `install-${name.replace(/[^a-z0-9-]/gi, "_")}.sh`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Gestiona servidores y tokens de ingesta</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Añadir servidor</CardTitle>
          <CardDescription>
            Cada servidor recibe un token único para enviar métricas al endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre *</Label>
                <Input id="name" placeholder="prod-web-01" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hostname">Hostname (opcional)</Label>
                <Input id="hostname" placeholder="web01.example.com" value={hostname} onChange={(e) => setHostname(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={creating}>
              <Plus className="h-4 w-4" />
              {creating ? "Creando..." : "Crear servidor"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoint de ingesta</CardTitle>
          <CardDescription>El agente debe hacer POST aquí con el header <code className="text-xs">x-ingest-token</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted p-2 rounded break-all">{INGEST_URL}</code>
            <Button size="icon" variant="outline" onClick={() => copy(INGEST_URL)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Servidores registrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">Aún no hay servidores.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.hostname ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowTokenFor(showTokenFor === r.id ? null : r.id)}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        {showTokenFor === r.id ? "Ocultar" : "Mostrar"}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showTokenFor &&
        rows
          .filter((r) => r.id === showTokenFor)
          .map((r) => (
            <Card key={r.id} className="border-primary/40">
              <CardHeader>
                <CardTitle className="text-base">Credenciales para {r.name}</CardTitle>
                <CardDescription>Guárdalo en un sitio seguro. No lo mostraremos sin que lo pidas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Ingest token</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs bg-muted p-2 rounded break-all">{r.ingest_token}</code>
                    <Button size="icon" variant="outline" onClick={() => copy(r.ingest_token, "Token copiado")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5" /> Instalación en un comando
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Ejecútalo como root en el servidor. Instala Python, psutil, descarga el agente y lo registra como servicio systemd (<code className="text-[10px]">server-monitor.service</code>). Reporta cada 30s con métricas de CPU/RAM/disco/red/load + Docker.
                  </p>
                  <div className="flex items-start gap-2">
                    <pre className="flex-1 text-xs bg-muted p-3 rounded overflow-auto whitespace-pre-wrap break-all">
                      {installOneLiner(r.ingest_token)}
                    </pre>
                    <Button size="icon" variant="outline" onClick={() => copy(installOneLiner(r.ingest_token), "Comando copiado")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" variant="secondary" onClick={() => downloadInstaller(r.ingest_token, r.name)}>
                      <Download className="h-3.5 w-3.5" />
                      Descargar install.sh
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`${INSTALLER_URL}?file=agent.py`} target="_blank" rel="noreferrer">
                        Ver agent.py
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={`${INSTALLER_URL}?file=server-monitor.service&token=${r.ingest_token}`} target="_blank" rel="noreferrer">
                        Ver service unit
                      </a>
                    </Button>
                  </div>
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Comandos útiles tras instalar
                    </summary>
                    <pre className="bg-muted p-3 rounded mt-2 overflow-auto">{`# ver logs en vivo
journalctl -u server-monitor -f

# reiniciar
systemctl restart server-monitor

# desinstalar
systemctl disable --now server-monitor
rm -rf /opt/server-monitor /etc/systemd/system/server-monitor.service
systemctl daemon-reload`}</pre>
                  </details>
                </div>
              </CardContent>
            </Card>
          ))}
    </div>
  );
};

export default Settings;
