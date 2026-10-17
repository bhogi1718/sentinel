/// App URLs. Every organization page lives under /o/:orgId, and every
/// device page under /o/:orgId/devices/:deviceId - the URL is the single
/// source of truth for which organization and device a page is showing.
export const routes = {
  root: "/",
  login: "/login",
  noOrganization: "/no-organization",

  dashboard: (orgId: string) => `/o/${orgId}`,
  devices: (orgId: string) => `/o/${orgId}/devices`,
  device: (orgId: string, deviceId: string) => `/o/${orgId}/devices/${deviceId}`,
  deviceProcesses: (orgId: string, deviceId: string) => `/o/${orgId}/devices/${deviceId}/processes`,
  deviceFiles: (orgId: string, deviceId: string) => `/o/${orgId}/devices/${deviceId}/files`,
  events: (orgId: string) => `/o/${orgId}/events`,
  settings: (orgId: string) => `/o/${orgId}/settings`,
};
