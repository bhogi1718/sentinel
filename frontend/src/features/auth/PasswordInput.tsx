import { forwardRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Icon } from "@/components/ui/Icon";

/// A password field with a lock icon and a show/hide toggle, styled like the
/// console's Input.
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
          <Icon name="lock" size={18} />
        </span>
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          placeholder="••••••••"
          className="w-full rounded-lg border border-outline-variant bg-surface-container py-2.5 pl-10 pr-10 text-body-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant transition-colors hover:text-on-surface"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <Icon name={visible ? "visibility_off" : "visibility"} size={18} />
        </button>
      </div>
    );
  },
);
