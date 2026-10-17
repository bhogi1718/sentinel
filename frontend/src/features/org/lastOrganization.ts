const LAST_ORG_KEY = "sentinel_last_org";

/// Remembers the organization last opened in this browser, so "/" returns
/// the user to it. A convenience only - the value is always checked against
/// the user's current memberships before it is used.
export function rememberOrganization(orgId: string): void {
  try {
    localStorage.setItem(LAST_ORG_KEY, orgId);
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
}

export function lastOrganization(): string | null {
  try {
    return localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null;
  }
}
