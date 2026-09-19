import { useQuery } from "@tanstack/react-query";
import { processApi } from "@/api/process.api";

export function useProcesses() {
  return useQuery({
    queryKey: ["processes"],
    queryFn: processApi.list,
    enabled: false,
    staleTime: Infinity,
  });
}
