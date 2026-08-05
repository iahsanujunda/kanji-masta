import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PhotoSessionResult } from "@/lib/photo";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";

export function useScanSession(sessionId?: string) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.photoSession(user?.id ?? "", sessionId),
    queryFn: () => apiFetch<PhotoSessionResult>(`/api/photo/session/${sessionId}`),
    enabled: Boolean(user && sessionId),
    refetchInterval: (query) =>
      query.state.data?.status === "processing" && document.visibilityState === "visible" ? 2_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
  const status = query.data?.status;
  const refetch = query.refetch;

  useEffect(() => {
    if (!sessionId || status !== "processing") return;
    const refetchWhenVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", refetchWhenVisible);
    document.addEventListener("visibilitychange", refetchWhenVisible);
    return () => {
      window.removeEventListener("focus", refetchWhenVisible);
      document.removeEventListener("visibilitychange", refetchWhenVisible);
    };
  }, [refetch, sessionId, status]);

  return query;
}
