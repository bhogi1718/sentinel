import { Navigate, Outlet } from "react-router-dom";
import { FullPageSpinner } from "@/components/ui/FullPageSpinner";
import { routes } from "@/lib/routes";
import { useAuth } from "./useAuth";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;

  if (!isAuthenticated) {
    return <Navigate to={routes.login} replace />;
  }

  return <Outlet />;
}
