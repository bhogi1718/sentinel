import type { IconName } from "@/components/ui/Icon";
import type { CommandType } from "@/api/command.api";

export interface RemoteCommandMeta {
  type: CommandType;
  icon: IconName;
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  danger: boolean;
}

export const REMOTE_COMMANDS: Record<CommandType, RemoteCommandMeta> = {
  LOCK: {
    type: "LOCK",
    icon: "lock",
    label: "Lock",
    confirmTitle: "Lock workstation?",
    confirmDescription: "Immediately locks the laptop's active session.",
    danger: false,
  },
  RESTART: {
    type: "RESTART",
    icon: "restart_alt",
    label: "Reset",
    confirmTitle: "Restart laptop?",
    confirmDescription: "The laptop will reboot immediately. Unsaved work may be lost.",
    danger: true,
  },
  SHUTDOWN: {
    type: "SHUTDOWN",
    icon: "power_settings_new",
    label: "Off",
    confirmTitle: "Shut down laptop?",
    confirmDescription: "The laptop will power off completely and stay off until turned on manually.",
    danger: true,
  },
  SLEEP: {
    type: "SLEEP",
    icon: "bedtime",
    label: "Sleep",
    confirmTitle: "Put laptop to sleep?",
    confirmDescription: "The laptop will enter low-power sleep mode.",
    danger: false,
  },
  LOG_OFF: {
    type: "LOG_OFF",
    icon: "logout",
    label: "Exit",
    confirmTitle: "Log off current user?",
    confirmDescription: "Ends the active desktop session. Unsaved work may be lost.",
    danger: true,
  },
};
