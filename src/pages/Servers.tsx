import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Server } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  hostname: string | null;
  status: string;
  last_seen_at: string | null;
  os: string | null;
}

const Servers = () => {
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("servers")
      .select("id, name, hostname, status, last_seen_at, os")
      .order("created_at", { ascending: true });
    setRows(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("servers-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "servers" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Servidores</h1>
          <p className="text-sm text-muted-foreground">Gestiona tus servidores monitorizados</p>
        </div>
        <Button asChild>
          <Link to="/settings">
            <Plus className="h-4 w-4" />
            Añadir servidor
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-16 text-center">
              <Server className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No hay servidores registrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último reporte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link to={`/servers/${r.id}`} className="hover:text-primary">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.hostname ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.os ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          r.status === "online"
                            ? "bg-success/10 text-success"
                            : r.status === "offline"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {relativeTime(r.last_seen_at)}
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

export default Servers;
