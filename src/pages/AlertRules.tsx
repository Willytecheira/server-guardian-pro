import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Send, PlayCircle } from "lucide-react";
import { toast } from "sonner";

type Metric = "cpu_percent" | "ram_percent" | "disk_percent" | "offline";
type Severity = "info" | "warning" | "critical";

interface Rule {
  id: string;
  name: string;
  metric: Metric;
  operator: ">" | ">=" | "<" | "<=" | "=";
  threshold: number;
  duration_minutes: number;
  severity: Severity;
  enabled: boolean;
}

interface Notif {
  telegram_chat_id: string | null;
  telegram_enabled: boolean;
}

const metricLabel: Record<Metric, string> = {
  cpu_percent: "CPU %",
  ram_percent: "RAM %",
  disk_percent: "Disco %",
  offline: "Offline (min)",
};

const AlertRules = () => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [notif, setNotif] = useState<Notif>({ telegram_chat_id: "", telegram_enabled: false });
  const [savingNotif, setSavingNotif] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [form, setForm] = useState<Omit<Rule, "id">>({
    name: "",
    metric: "cpu_percent",
    operator: ">",
    threshold: 90,
    duration_minutes: 5,
    severity: "warning",
    enabled: true,
  });

  const load = async () => {
    const [r, n] = await Promise.all([
      supabase.from("alert_rules").select("*").order("created_at"),
      supabase.from("notification_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    setRules((r.data ?? []) as Rule[]);
    if (n.data) setNotif({ telegram_chat_id: n.data.telegram_chat_id ?? "", telegram_enabled: n.data.telegram_enabled });
  };

  useEffect(() => {
    load();
  }, []);

  const saveNotif = async () => {
    setSavingNotif(true);
    const { error } = await supabase
      .from("notification_settings")
      .update({
        telegram_chat_id: notif.telegram_chat_id?.trim() || null,
        telegram_enabled: notif.telegram_enabled,
      })
      .eq("id", 1);
    setSavingNotif(false);
    if (error) toast.error(error.message);
    else toast.success("Notificaciones actualizadas");
  };

  const updateRule = async (id: string, patch: Partial<Rule>) => {
    const { error } = await supabase.from("alert_rules").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const deleteRule = async (id: string) => {
    if (!confirm("¿Eliminar regla?")) return;
    const { error } = await supabase.from("alert_rules").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Regla eliminada");
      load();
    }
  };

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { error } = await supabase.from("alert_rules").insert(form);
    if (error) toast.error(error.message);
    else {
      toast.success("Regla creada");
      setForm({ ...form, name: "" });
      load();
    }
  };

  const runNow = async () => {
    setEvaluating(true);
    const { data, error } = await supabase.functions.invoke("evaluate-alerts");
    setEvaluating(false);
    if (error) toast.error(error.message);
    else
      toast.success(
        `Evaluado: ${data?.triggered ?? 0} alertas nuevas, ${data?.resolved ?? 0} resueltas`,
      );
  };

  const sendTestTelegram = async () => {
    if (!notif.telegram_chat_id?.trim()) {
      toast.error("Configura primero el chat ID");
      return;
    }
    // Trigger evaluator (does not force a test message). Instead, hint user via toast.
    toast.info("Para probar Telegram, activa una regla con umbral bajo y ejecuta 'Evaluar ahora'.");
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Reglas de alerta</h1>
          <p className="text-sm text-muted-foreground">
            Reglas globales evaluadas cada 2 minutos sobre todas las métricas reportadas.
          </p>
        </div>
        <Button onClick={runNow} disabled={evaluating} variant="secondary">
          <PlayCircle className="h-4 w-4" />
          {evaluating ? "Evaluando..." : "Evaluar ahora"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificaciones por Telegram</CardTitle>
          <CardDescription>
            Crea un bot con @BotFather, escríbele desde tu chat/canal, y pega el chat ID aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="chat">Chat ID</Label>
              <Input
                id="chat"
                placeholder="-1001234567890"
                value={notif.telegram_chat_id ?? ""}
                onChange={(e) => setNotif({ ...notif, telegram_chat_id: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 h-10">
              <Switch
                id="enabled"
                checked={notif.telegram_enabled}
                onCheckedChange={(v) => setNotif({ ...notif, telegram_enabled: v })}
              />
              <Label htmlFor="enabled">Activado</Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveNotif} disabled={savingNotif}>
                {savingNotif ? "Guardando..." : "Guardar"}
              </Button>
              <Button variant="outline" onClick={sendTestTelegram}>
                <Send className="h-4 w-4" /> Probar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva regla</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createRule} className="grid sm:grid-cols-6 gap-3 items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="CPU crítica"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Métrica</Label>
              <Select
                value={form.metric}
                onValueChange={(v) => setForm({ ...form, metric: v as Metric })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpu_percent">CPU %</SelectItem>
                  <SelectItem value="ram_percent">RAM %</SelectItem>
                  <SelectItem value="disk_percent">Disco %</SelectItem>
                  <SelectItem value="offline">Offline (min)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Umbral</Label>
              <Input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duración (min)</Label>
              <Input
                type="number"
                min={0}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Severidad</Label>
              <Select
                value={form.severity}
                onValueChange={(v) => setForm({ ...form, severity: v as Severity })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="sm:col-span-6 sm:w-fit">
              <Plus className="h-4 w-4" /> Crear regla
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reglas configuradas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">Sin reglas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Métrica</TableHead>
                  <TableHead>Condición</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Activa</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{metricLabel[r.metric]}</TableCell>
                    <TableCell>
                      {r.operator} {r.threshold}
                      {r.metric !== "offline" && "%"}
                    </TableCell>
                    <TableCell>{r.duration_minutes} min</TableCell>
                    <TableCell>
                      <span
                        className={
                          r.severity === "critical"
                            ? "text-destructive"
                            : r.severity === "warning"
                              ? "text-warning"
                              : "text-primary"
                        }
                      >
                        {r.severity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={(v) => updateRule(r.id, { enabled: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => deleteRule(r.id)}>
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
    </div>
  );
};

export default AlertRules;
