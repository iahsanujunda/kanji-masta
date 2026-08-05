import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { PhotoActivityPage, PhotoActivityUnseen } from "@/lib/photo";

export const PHOTO_ACTIVITY_PAGE_SIZE = 20;

export function usePhotoActivityPages(userId: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["photo-activity", userId],
    enabled: Boolean(userId) && enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PHOTO_ACTIVITY_PAGE_SIZE) });
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<PhotoActivityPage>(`/api/photo/activity?${params}`);
    },
    getNextPageParam: (page) => page.hasMore ? page.nextCursor ?? undefined : undefined,
    staleTime: 10_000,
  });
}

export function usePhotoActivityUnseen(userId: string | undefined, drawerOpen: boolean) {
  return useQuery({
    queryKey: ["photo-activity-unseen", userId],
    queryFn: () => apiFetch<PhotoActivityUnseen>("/api/photo/activity/unseen"),
    enabled: Boolean(userId) && !drawerOpen,
    staleTime: 10_000,
    refetchInterval: drawerOpen ? false : 10_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}
