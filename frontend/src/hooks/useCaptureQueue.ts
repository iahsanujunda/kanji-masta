import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CAPTURE_QUEUE_CHANGED,
  drainCaptureQueue,
  listLocalCaptures,
} from "@/lib/captureQueue";

export function useCaptureQueue(userId?: string) {
  const queryClient = useQueryClient();
  const drain = useCallback((signal?: AbortSignal, force = false) => {
    if (!userId) return Promise.resolve();
    return drainCaptureQueue(userId, signal, force);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const refresh = (force = false) => {
      void queryClient.invalidateQueries({ queryKey: ["local-captures", userId] });
      void queryClient.invalidateQueries({ queryKey: ["local-capture"] });
      void queryClient.invalidateQueries({ queryKey: ["recent-scans"] });
      void drain(controller.signal, force);
    };
    const onQueueChanged = () => refresh();
    const onReconnect = () => refresh(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(true);
    };

    refresh(true);
    window.addEventListener("online", onReconnect);
    window.addEventListener("focus", onReconnect);
    window.addEventListener(CAPTURE_QUEUE_CHANGED, onQueueChanged);
    document.addEventListener("visibilitychange", onVisible);
    const retryTimer = window.setInterval(refresh, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(retryTimer);
      window.removeEventListener("online", onReconnect);
      window.removeEventListener("focus", onReconnect);
      window.removeEventListener(CAPTURE_QUEUE_CHANGED, onQueueChanged);
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
