import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage } from "@/api/client";
import { demoApi } from "@/api/demo.api";
import { routes } from "@/lib/routes";
import { useAuth } from "./useAuth";

/// "Try the demo": whether this deployment offers the public demo, and a
/// one-click way into it. Shared by the landing and login pages.
export function useTryDemo() {
  const { startDemo } = useAuth();
  const navigate = useNavigate();
  // Retried, and refreshed now and then: on a free hosting tier the backend
  // may still be waking up when the page first asks, and a single failed
  // check must not hide the demo for the rest of the visit.
  const { data: enabled } = useQuery({
    queryKey: ["demo", "enabled"],
    queryFn: demoApi.isEnabled,
    staleTime: 5 * 60_000,
    retry: 4,
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setError(null);
    setStarting(true);
    try {
      await startDemo();
      navigate(routes.app);
    } catch (err) {
      setError(extractErrorMessage(err));
      setStarting(false);
    }
  }

  return { enabled: enabled === true, start, starting, error };
}
