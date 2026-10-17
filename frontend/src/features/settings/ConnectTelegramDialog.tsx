import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { extractErrorMessage } from "@/api/client";
import { settingsApi } from "@/api/settings.api";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { connectTelegramSchema } from "./connectTelegramSchema";
import type { ConnectTelegramFormValues } from "./connectTelegramSchema";

interface ConnectTelegramDialogProps {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export function ConnectTelegramDialog({ orgId, open, onClose, onConnected }: ConnectTelegramDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ConnectTelegramFormValues>({ resolver: zodResolver(connectTelegramSchema) });

  function handleClose(): void {
    reset();
    onClose();
  }

  async function onSubmit(values: ConnectTelegramFormValues): Promise<void> {
    try {
      await settingsApi.connectTelegram(orgId, values.botToken, values.chatId);
      reset();
      onConnected();
    } catch (err) {
      setError("chatId", { message: extractErrorMessage(err) });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissible={!isSubmitting}
      title="Connect Telegram"
      icon="send"
      description={
        <>
          Create a bot via{" "}
          <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            @BotFather
          </a>
          , message it once, then use its <code className="text-[11px]">getUpdates</code> API to find your chat ID.
        </>
      }
    >
      <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-sm" noValidate>
        <div className="flex flex-col gap-xs">
          <label htmlFor="botToken" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
            Bot Token
          </label>
          <input
            id="botToken"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="123456789:AA..."
            className="w-full rounded-lg bg-surface-container-highest px-4 py-2.5 font-mono text-body-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/40"
            {...register("botToken")}
          />
          {errors.botToken && <p className="text-body-sm text-error">{errors.botToken.message}</p>}
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor="chatId" className="ml-1 font-mono text-label-mono uppercase text-on-surface-variant">
            Chat ID
          </label>
          <input
            id="chatId"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="123456789"
            className="w-full rounded-lg bg-surface-container-highest px-4 py-2.5 font-mono text-body-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/40"
            {...register("chatId")}
          />
          {errors.chatId && <p className="text-body-sm text-error">{errors.chatId.message}</p>}
        </div>

        <div className="mt-sm flex justify-end gap-sm">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 font-mono text-label-mono uppercase text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-xs rounded-lg bg-primary-container px-4 py-2 font-mono text-label-mono uppercase text-on-primary transition-all active:scale-[0.98] disabled:opacity-70 hover:shadow-[0_0_16px_rgba(37,99,235,0.3)]"
          >
            {isSubmitting && <Icon name="sync" size={16} className="animate-spin" />}
            Connect
          </button>
        </div>
      </form>
    </Dialog>
  );
}
