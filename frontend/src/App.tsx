import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LoginPage } from "@/features/auth/LoginPage";
import { LandingPage } from "@/features/marketing/LandingPage";
import { MarketingLayout } from "@/features/marketing/MarketingLayout";
import { NotFoundPage } from "@/features/marketing/NotFoundPage";
import { PricingPage } from "@/features/marketing/PricingPage";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DeviceLayout } from "@/features/device/DeviceLayout";
import { DevicePage } from "@/features/device/DevicePage";
import { DevicesPage } from "@/features/devices/DevicesPage";
import { AuditLogPage } from "@/features/audit/AuditLogPage";
import { EventsPage } from "@/features/events/EventsPage";
import { FilesPage } from "@/features/files/FilesPage";
import { NoOrganizationPage } from "@/features/org/NoOrganizationPage";
import { OrgIndexRedirect } from "@/features/org/OrgIndexRedirect";
import { OrgScope } from "@/features/org/OrgScope";
import { RequirePermission } from "@/features/org/RequirePermission";
import { ProcessesPage } from "@/features/processes/ProcessesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { routes } from "@/lib/routes";

/// Console URLs from before organizations existed. Old bookmarks still
/// land in the console instead of on a 404.
const LEGACY_CONSOLE_PATHS = ["/dashboard", "/device", "/events", "/files", "/processes", "/settings"];

export function App() {
  return (
    <Routes>
      {/* The public site. */}
      <Route element={<MarketingLayout />}>
        <Route path={routes.home} element={<LandingPage />} />
        <Route path={routes.pricing} element={<PricingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path={routes.login} element={<LoginPage />} />
      {LEGACY_CONSOLE_PATHS.map((path) => (
        <Route key={path} path={path} element={<Navigate to={routes.app} replace />} />
      ))}

      <Route element={<ProtectedRoute />}>
        <Route path={routes.app} element={<OrgIndexRedirect />} />
        <Route path={routes.noOrganization} element={<NoOrganizationPage />} />

        {/* Every organization page: the org comes from the URL, is checked
            against the user's memberships, and is provided to all below. */}
        <Route path="/o/:orgId" element={<OrgScope />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="devices/:deviceId" element={<DeviceLayout />}>
              <Route index element={<DevicePage />} />
              <Route
                path="processes"
                element={
                  <RequirePermission permission="processes:view">
                    <ProcessesPage />
                  </RequirePermission>
                }
              />
              <Route
                path="files"
                element={
                  <RequirePermission permission="files:access">
                    <FilesPage />
                  </RequirePermission>
                }
              />
            </Route>
            <Route path="events" element={<EventsPage />} />
            <Route
              path="audit"
              element={
                <RequirePermission permission="audit:view">
                  <AuditLogPage />
                </RequirePermission>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
