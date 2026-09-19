export type IconName =
  | "dashboard"
  | "notifications"
  | "laptop_mac"
  | "folder"
  | "terminal"
  | "settings"
  | "lock"
  | "lock_open"
  | "restart_alt"
  | "power_settings_new"
  | "bedtime"
  | "logout"
  | "alternate_email"
  | "visibility"
  | "visibility_off"
  | "arrow_forward"
  | "check_circle"
  | "sync"
  | "trending_up"
  | "history"
  | "search"
  | "filter_list"
  | "calendar_today"
  | "event"
  | "expand_more"
  | "chevron_left"
  | "chevron_right"
  | "chevron_down"
  | "language"
  | "battery_alert"
  | "error_outline"
  | "memory"
  | "memory_alt"
  | "wifi"
  | "lan"
  | "screenshot"
  | "key"
  | "send"
  | "smartphone"
  | "public"
  | "security"
  | "manage_search"
  | "swap_vert"
  | "more_horiz"
  | "more_vert"
  | "close"
  | "upload"
  | "download"
  | "delete"
  | "create_new_folder"
  | "home"
  | "picture_as_pdf"
  | "folder_zip"
  | "drive_file_rename_outline"
  | "move_up"
  | "share";

interface IconProps {
  name: IconName;
  size?: number;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 20, filled = false, className = "" }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  );
}
