import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Activity } from "lucide-react";

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Activity className="h-6 w-6 animate-pulse text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return children;
};

export default ProtectedRoute;
