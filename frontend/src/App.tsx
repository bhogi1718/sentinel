import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { LoginPage } from "@/features/auth/LoginPage";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { DeviceLayout } from "@/features/device/DeviceLayout";
import { DevicePage } from "@/features/device/DevicePage";
import { DevicesPage } from "@/features/devices/DevicesPage";
import { EventsPage } from "@/features/events/EventsPage";
import { FilesPage } from "@/features/files/FilesPage";
import { NoOrganizationPage } from "@/features/org/NoOrganizationPage";
import { OrgIndexRedirect } from "@/features/org/OrgIndexRedirect";
import { OrgScope } from "@/features/org/OrgScope";
import { RequirePermission } from "@/features/org/RequirePermission";
import { ProcessesPage } from "@/features/processes/ProcessesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { routes } from "@/lib/routes";

export function App() {
  return (
    <Routes>
      <Route path={routes.login} element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path={routes.root} element={<OrgIndexRedirect />} />
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
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      {/* Anything else - including the old single-device URLs like /device
          or /dashboard - lands on the user's default organization. */}
      <Route path="*" element={<Navigate to={routes.root} replace />} />
    </Routes>
  );
}
