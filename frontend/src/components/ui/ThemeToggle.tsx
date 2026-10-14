import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { useTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";

const ORDER: ThemeMode[] = ["light", "dark", "system"];
const ICON: Record<ThemeMode, IconName> = {
  light: "light_mode",
  dark: "dark_mode",
  system: "brightness_auto",
};
const LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/// Cycles Light -> Dark -> System. The icon reflects the chosen mode.
export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  function next(): void {
    const i = ORDER.indexOf(mode);
    setMode(ORDER[(i + 1) % ORDER.length]);
  }

  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${LABEL[mode]} (tap to change)`}
      aria-label={`Theme: ${LABEL[mode]}`}
      className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-white/5 hover:text-on-surface"
    >
      <Icon name={ICON[mode]} size={18} />
    </button>
  );
}
