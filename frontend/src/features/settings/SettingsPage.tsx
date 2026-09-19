import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { settingsApi } from "@/api/settings.api";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { ConnectTelegramDialog } from "./ConnectTelegramDialog";

const INTEGRATIONS_QUERY_KEY = ["settings", "integrations"];

export function SettingsPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [connectTelegramOpen, setConnectTelegramOpen] = useState(false);

  const { data: integrations } = useQuery({
    queryKey: INTEGRATIONS_QUERY_KEY,
    queryFn: settingsApi.getIntegrationStatus,
  });
  const telegramConnected = integrations?.telegram.connected ?? false;

  const disconnectMutation = useMutation({
    mutationFn: () => settingsApi.disconnectTelegram(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QUERY_KEY });
    },
  });

  function handleTelegramConnected(): void {
    setConnectTelegramOpen(false);
    void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QUERY_KEY });
  }

  function handlePasswordChanged(): void {
    setChangePasswordOpen(false);
    // The server already revoked every refresh token for this account -
    // logout() clears local state to match (its own best-effort server
    // call will just no-op against the already-revoked token).
    void logout();
  }

  return (
    <div className="flex flex-col gap-lg">
      {/* Profile */}
      <section className="flex flex-col gap-md">
        <div className="surface-card flex items-center gap-md p-md">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Icon name="security" size={28} />
            </div>
            <div className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-surface-container-low bg-success" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body-lg font-medium text-on-surface">{user?.email}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">
              Single administrator
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setChangePasswordOpen(true)}
          className="group flex w-full items-center justify-center gap-base rounded-xl bg-surface-container-high px-lg py-md transition-colors hover:bg-surface-container-highest"
        >
          <Icon name="key" size={20} className="text-primary" />
          <span className="font-semibold text-on-surface">Change Password</span>
          <Icon name="chevron_right" size={20} className="ml-auto text-on-surface-variant" />
        </button>
      </section>

      {/* Integrations */}
      <section className="flex flex-col gap-base">
        <h3 className="px-xs font-mono text-label-mono uppercase text-on-surface-variant">Integrations</h3>
        <div className="surface-card flex flex-col gap-sm p-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon name="send" size={20} className="text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-on-surface">Telegram Alerts</span>
                <div className="flex items-center gap-xs">
                  <span className={`h-1.5 w-1.5 rounded-full ${telegramConnected ? "bg-success" : "bg-outline"}`} />
                  <span className="font-mono text-[10px] uppercase text-on-surface-variant">
                    {telegramConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
              </div>
            </div>
            {telegramConnected ? (
              <button
                type="button"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="rounded-lg bg-surface-container-highest px-4 py-2 text-body-sm font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
              >
                {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConnectTelegramOpen(true)}
                className="rounded-lg bg-primary-container px-4 py-2 text-body-sm font-medium text-on-primary transition-colors hover:shadow-[0_0_16px_rgba(37,99,235,0.3)]"
              >
                Connect
              </button>
            )}
          </div>
          {disconnectMutation.isError && (
            <p className="text-body-sm text-error">{extractErrorMessage(disconnectMutation.error)}</p>
          )}
        </div>
      </section>

      {/* Session */}
      <section className="flex flex-col gap-base">
        <h3 className="px-xs font-mono text-label-mono uppercase text-on-surface-variant">Session</h3>
        <div className="surface-card flex items-center justify-between p-md">
          <div className="flex items-center gap-md">
            <Icon name="public" size={20} className="text-on-surface-variant" />
            <div className="flex flex-col">
              <span className="font-semibold text-on-surface">This browser</span>
              <span className="text-body-sm text-on-surface-variant">
                <span className="italic text-primary">Current session</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg p-xs text-error transition-colors hover:bg-error/10"
            aria-label="Log out"
          >
            <Icon name="logout" size={20} />
          </button>
        </div>
      </section>

      {/* App info */}
      <section className="flex flex-col gap-md pt-md">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-surface-container-high to-surface-container-low p-md">
          <div className="absolute -right-4 -top-4 rotate-12 text-on-surface opacity-5">
            <Icon name="security" size={120} />
          </div>
          <div className="relative z-10 flex flex-col gap-sm">
            <span className="text-body-lg font-medium text-on-surface">Sentinel</span>
            <div className="grid grid-cols-2 gap-md">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase text-on-surface-variant">Version</span>
                <span className="text-body-md text-on-surface">v0.1.0</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase text-on-surface-variant">Deployment</span>
                <span className="text-body-md text-on-surface">Personal instance</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-xs pb-lg opacity-40">
          <span className="font-mono text-[10px] text-on-surface-variant">ENCRYPTED END-TO-END</span>
        </div>
      </section>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onChanged={handlePasswordChanged}
      />
      <ConnectTelegramDialog
        open={connectTelegramOpen}
        onClose={() => setConnectTelegramOpen(false)}
        onConnected={handleTelegramConnected}
      />
    </div>
  );
}
