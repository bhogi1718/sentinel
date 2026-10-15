import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { extractErrorMessage } from "@/api/client";
import { settingsApi } from "@/api/settings.api";
import { Icon } from "@/components/ui/Icon";
import { Button, Card, PageHeader, SectionLabel, Segmented, StatusPill } from "@/components/ui/kit";
import { useAuth } from "@/features/auth/useAuth";
import { useTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { ConnectTelegramDialog } from "./ConnectTelegramDialog";

const INTEGRATIONS_QUERY_KEY = ["settings", "integrations"];

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QUERY_KEY }),
  });

  function handleTelegramConnected(): void {
    setConnectTelegramOpen(false);
    void queryClient.invalidateQueries({ queryKey: INTEGRATIONS_QUERY_KEY });
  }

  function handlePasswordChanged(): void {
    setChangePasswordOpen(false);
    void logout();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-lg">
      <PageHeader title="Settings" subtitle="Account, integrations, and appearance" icon="settings" />

      {/* Account */}
      <section className="flex flex-col gap-sm">
        <SectionLabel>Account</SectionLabel>
        <Card className="flex flex-col">
          <div className="flex items-center gap-md p-md">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name="person" size={22} />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-body-md text-on-surface">{user?.email}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">Single administrator</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setChangePasswordOpen(true)}
            className="flex items-center gap-sm border-t border-outline-variant px-md py-sm text-body-sm text-on-surface transition-colors hover:bg-surface-container/60"
          >
            <Icon name="key" size={18} className="text-primary" />
            Change password
            <Icon name="chevron_right" size={18} className="ml-auto text-on-surface-variant" />
          </button>
        </Card>
      </section>

      {/* Integrations */}
      <section className="flex flex-col gap-sm">
        <SectionLabel>Integrations</SectionLabel>
        <Card className="flex flex-col gap-sm p-md">
          <div className="flex items-center justify-between gap-sm">
            <div className="flex items-center gap-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon name="send" size={20} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-body-md text-on-surface">Telegram Alerts</span>
                <StatusPill tone={telegramConnected ? "success" : "default"} label={telegramConnected ? "Connected" : "Not connected"} />
              </div>
            </div>
            {telegramConnected ? (
              <Button variant="danger" disabled={disconnectMutation.isPending} onClick={() => disconnectMutation.mutate()}>
                {disconnectMutation.isPending ? "…" : "Disconnect"}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setConnectTelegramOpen(true)}>
                Connect
              </Button>
            )}
          </div>
          {disconnectMutation.isError && <p className="text-body-sm text-error">{extractErrorMessage(disconnectMutation.error)}</p>}
        </Card>
      </section>

      {/* Appearance */}
      <section className="flex flex-col gap-sm">
        <SectionLabel>Appearance</SectionLabel>
        <Card className="flex items-center justify-between gap-md p-md">
          <span className="text-body-md text-on-surface">Theme</span>
          <Segmented<ThemeMode>
            value={themeMode}
            onChange={setThemeMode}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "Auto" },
            ]}
          />
        </Card>
      </section>

      {/* Session */}
      <section className="flex flex-col gap-sm">
        <SectionLabel>Session</SectionLabel>
        <Card className="flex items-center justify-between p-md">
          <div className="flex items-center gap-md">
            <Icon name="public" size={20} className="text-on-surface-variant" />
            <div className="flex flex-col">
              <span className="text-body-md text-on-surface">This browser</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-primary">Current session</span>
            </div>
          </div>
          <Button variant="danger" icon="logout" onClick={() => void logout()}>
            Log out
          </Button>
        </Card>
      </section>

      <div className="flex items-center justify-center gap-sm pt-sm font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/50">
        <span>Sentinel v0.1.0</span>
        <span>·</span>
        <span>Personal instance</span>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} onChanged={handlePasswordChanged} />
      <ConnectTelegramDialog open={connectTelegramOpen} onClose={() => setConnectTelegramOpen(false)} onConnected={handleTelegramConnected} />
    </div>
  );
}
