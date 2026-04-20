import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Alert {
  id: string;
  severity: string;
  title: string;
  message: string | null;
  resolved: boolean;
  created_at: string;
}

const Alerts = () => {
  const [items, setItems] = useState<Alert[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("alerts")
      .select("id, severity, title, message, resolved, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setItems(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("alerts-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Alertas</h1>
        <p className="text-sm text-muted-foreground">Historial de eventos detectados</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No hay alertas todavía.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Las reglas y notificaciones por Telegram llegan en la Fase 2.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1 h-2 w-2 rounded-full shrink-0",
                    a.severity === "critical" && "bg-destructive",
                    a.severity === "warning" && "bg-warning",
                    a.severity === "info" && "bg-primary",
                  )}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{a.title}</p>
                    <span className="text-xs text-muted-foreground">{relativeTime(a.created_at)}</span>
                  </div>
                  {a.message && <p className="text-sm text-muted-foreground mt-1">{a.message}</p>}
                  {a.resolved && (
                    <span className="text-xs text-success mt-1 inline-block">Resuelta</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Alerts;
