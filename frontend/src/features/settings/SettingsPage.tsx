import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings.api";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/features/auth/useAuth";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { data: integrations } = useQuery({
    queryKey: ["settings", "integrations"],
    queryFn: settingsApi.getIntegrationStatus,
  });
  const telegramConnected = integrations?.telegram.connected ?? false;

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
          disabled
          title="Password change ships in a later module"
          className="group flex w-full items-center justify-center gap-base rounded-xl bg-surface-container-high px-lg py-md opacity-50 transition-colors"
        >
          <Icon name="key" size={20} className="text-primary" />
          <span className="font-semibold text-on-surface">Change Password</span>
          <Icon name="chevron_right" size={20} className="ml-auto text-on-surface-variant" />
        </button>
      </section>

      {/* Integrations */}
      <section className="flex flex-col gap-base">
        <h3 className="px-xs font-mono text-label-mono uppercase text-on-surface-variant">Integrations</h3>
        <div className="surface-card flex items-center justify-between p-md">
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
          {!telegramConnected && (
            <button
              type="button"
              disabled
              title="Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the backend .env to connect"
              className="rounded-lg bg-surface-container-highest px-4 py-2 text-body-sm font-medium text-on-surface-variant opacity-50"
            >
              Connect
            </button>
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
    </div>
  );
}
