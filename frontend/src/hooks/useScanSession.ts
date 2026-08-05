import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PhotoSessionResult } from "@/lib/photo";

export function useScanSession(sessionId?: string) {
  return useQuery({
    queryKey: ["photo-session", sessionId],
    queryFn: () => apiFetch<PhotoSessionResult>(`/api/photo/session/${sessionId}`),
    enabled: Boolean(sessionId),
    refetchInterval: (query) =>
      query.state.data?.status === "processing" && document.visibilityState === "visible" ? 2_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
}
