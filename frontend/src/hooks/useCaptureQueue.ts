import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CAPTURE_QUEUE_CHANGED,
  drainCaptureQueue,
  listLocalCaptures,
} from "@/lib/captureQueue";

export function useCaptureQueue(userId?: string) {
  const queryClient = useQueryClient();
  const drain = useCallback((signal?: AbortSignal) => {
    if (!userId) return Promise.resolve();
    return drainCaptureQueue(userId, signal);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["local-captures", userId] });
      void queryClient.invalidateQueries({ queryKey: ["local-capture"] });
      void queryClient.invalidateQueries({ queryKey: ["recent-scans"] });
      void drain(controller.signal);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(CAPTURE_QUEUE_CHANGED, refresh);
    document.addEventListener("visibilitychange", onVisible);
    const retryTimer = window.setInterval(refresh, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(retryTimer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CAPTURE_QUEUE_CHANGED, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [drain, queryClient, userId]);
}

export function useLocalCaptures(userId?: string) {
  return useQuery({
    queryKey: ["local-captures", userId],
    queryFn: () => listLocalCaptures(userId!),
    enabled: Boolean(userId),
    staleTime: Infinity,
  });
}
