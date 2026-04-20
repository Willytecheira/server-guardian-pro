import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Server, Bell, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: Activity },
  { to: "/servers", label: "Servidores", icon: Server },
  { to: "/alerts", label: "Alertas", icon: Bell },
  { to: "/settings", label: "Configuración", icon: Settings },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const loc = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Monitor</p>
            <p className="text-xs text-muted-foreground mt-0.5">Server Health</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((n) => {
            const active = loc.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-2">
          <p className="text-xs text-muted-foreground truncate" title={user?.email ?? ""}>
            {user?.email}
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="h-3.5 w-3.5" />
            Salir
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
};

export default AppLayout;
