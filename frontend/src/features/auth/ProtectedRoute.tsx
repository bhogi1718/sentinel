import { Navigate, Outlet } from "react-router-dom";
import { FullPageSpinner } from "@/components/ui/FullPageSpinner";
import { routes } from "@/lib/routes";
import { useAuth } from "./useAuth";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageSpinner />;

  // Signed-out visitors arriving at any console address see the public
  // landing page first; from there they can sign in.
  if (!isAuthenticated) {
    return <Navigate to={routes.home} replace />;
  }

  return <Outlet />;
}
