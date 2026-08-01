import { useQuery } from "@tanstack/react-query";
import { fileApi } from "@/api/file.api";

export function useFiles(path: string) {
  return useQuery({
    queryKey: ["files", path],
    queryFn: () => fileApi.list(path),
  });
}
