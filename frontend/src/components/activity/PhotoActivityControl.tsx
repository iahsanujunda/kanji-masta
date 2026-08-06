import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  IconButton,
  Skeleton,
  SwipeableDrawer,
  Typography,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import CloseIcon from "@mui/icons-material/Close";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import HourglassTopOutlinedIcon from "@mui/icons-material/HourglassTopOutlined";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { LocalCapture } from "@/lib/captureQueue";
import type { PhotoActivityItem, PhotoActivityUnseen } from "@/lib/photo";
import { useLocalCaptures } from "@/hooks/useCaptureQueue";
import { usePhotoActivityPages, usePhotoActivityUnseen } from "@/hooks/usePhotoActivity";

export const ACTIVITY_DRAWER_ENTER_MS = 300;
export const ACTIVITY_DRAWER_EXIT_MS = 260;

export default function PhotoActivityControl({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const unseenQuery = usePhotoActivityUnseen(userId, open);
  const activityQuery = usePhotoActivityPages(userId, open);
  const { data: localCaptures = [] } = useLocalCaptures(userId);
  const visibleLocalCaptures = useMemo(
    () => localCaptures.filter((capture) => capture.status !== "server-owned"),
    [localCaptures],
  );
  const serverItems = activityQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const activeServerItems = serverItems.filter((item) => item.status === "processing");
  const terminalServerItems = serverItems.filter((item) => item.status !== "processing");
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = activityQuery;

  const seenMutation = useMutation({
    mutationFn: (seenThrough: string) => apiFetch<{ acknowledged: boolean }>("/api/photo/activity/seen", {
      method: "POST",
      body: JSON.stringify({ seenThrough }),
    }),
  });

  const openDrawer = () => {
    setOpen(true);
    const unseen = unseenQuery.data;
    if (!userId || !unseen?.hasUnseen || !unseen.latestTerminalAt) return;
    queryClient.setQueryData<PhotoActivityUnseen>(["photo-activity-unseen", userId], {
      ...unseen,
      hasUnseen: false,
    });
    seenMutation.mutate(unseen.latestTerminalAt);
  };

  const closeDrawer = () => {
    setOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["photo-activity-unseen", userId] });
  };

  useEffect(() => {
    const target = sentinelRef.current;
    const root = scrollRef.current;
    if (!target || !root || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) {
        void fetchNextPage();
      }
    }, { root, rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const hasUnseen = Boolean(unseenQuery.data?.hasUnseen) && !open;
  const iconLabel = hasUnseen ? "Activity, new updates" : "Activity";

  return (
    <>
      <IconButton
        aria-label={iconLabel}
        onClick={openDrawer}
        sx={{ color: "text.secondary", minWidth: 44, minHeight: 44, position: "relative" }}
      >
        <NotificationsNoneIcon />
        {hasUnseen && (
          <Box
            data-testid="photo-activity-unseen-dot"
            sx={{
              position: "absolute",
              insetBlockStart: 8,
              insetInlineEnd: 8,
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "#34d399",
              border: "2px solid #0a0a0f",
              boxSizing: "content-box",
            }}
          />
        )}
      </IconButton>

      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onOpen={openDrawer}
        onClose={closeDrawer}
        disableSwipeToOpen
        transitionDuration={{ enter: ACTIVITY_DRAWER_ENTER_MS, exit: ACTIVITY_DRAWER_EXIT_MS }}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          role: "dialog",
          "aria-modal": true,
          "aria-labelledby": titleId,
          "data-photo-activity-drawer": "true",
          sx: {
            width: "min(100vw, 480px)",
            height: "min(76dvh, 680px)",
            maxHeight: "88dvh",
            mx: "auto",
            left: 0,
            right: 0,
            borderRadius: "24px 24px 0 0",
            border: "1px solid #2a2a38",
            borderBottom: 0,
            bgcolor: "#0f0f16",
            backgroundImage: "none",
            color: "grey.100",
            overflow: "hidden",
            willChange: "transform",
            transitionProperty: "transform !important",
            transitionDuration: `${open ? ACTIVITY_DRAWER_ENTER_MS : ACTIVITY_DRAWER_EXIT_MS}ms !important`,
            transitionTimingFunction: `${open ? "cubic-bezier(0.16, 1, 0.3, 1)" : "cubic-bezier(0.4, 0, 1, 1)"} !important`,
            "@media (prefers-reduced-motion: reduce)": { transitionDuration: "1ms !important" },
          },
        }}
        slotProps={{
          backdrop: {
            sx: {
              transitionProperty: "opacity !important",
              transitionDuration: `${open ? 220 : 200}ms !important`,
              "@media (prefers-reduced-motion: reduce)": { transitionDuration: "1ms !important" },
            },
          },
        }}
      >
        <Box sx={{ width: 42, height: 4, borderRadius: 2, bgcolor: "grey.700", mx: "auto", mt: 1.25, flexShrink: 0 }} />
        <Box sx={{ px: 2.5, py: 1.25, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <Typography id={titleId} sx={{ fontSize: 18, fontWeight: 800 }}>Activity</Typography>
          <IconButton aria-label="Close Activity" onClick={closeDrawer} sx={{ color: "grey.400", minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Box
          ref={scrollRef}
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", px: 2.5, pb: "max(24px, env(safe-area-inset-bottom))" }}
        >
          {activityQuery.isLoading ? (
            <ActivitySkeleton />
          ) : activityQuery.isError && !activityQuery.data ? (
            <Alert
              severity="warning"
              action={<Box component="button" type="button" onClick={() => void activityQuery.refetch()} sx={retryButtonSx}>Try again</Box>}
              sx={{ mt: 2, bgcolor: "rgba(248,113,113,.08)", color: "grey.200" }}
            >
              Could not load scan activity
            </Alert>
          ) : visibleLocalCaptures.length === 0 && serverItems.length === 0 ? (
            <ActivityEmpty />
          ) : (
            <>
              {(visibleLocalCaptures.length > 0 || activeServerItems.length > 0) && (
                <ActivitySection title="Now">
                  {visibleLocalCaptures.map((capture) => (
                    <LocalActivityRow key={capture.id} capture={capture} onOpen={() => {
                      closeDrawer();
                      navigate(`/capture-queue/${capture.id}`);
                    }} />
                  ))}
                  {activeServerItems.map((item) => (
                    <ServerActivityRow key={item.sessionId} item={item} onOpen={() => {
                      closeDrawer();
                      navigate(`/captures/${item.sessionId}`);
                    }} />
                  ))}
                </ActivitySection>
              )}
              {terminalServerItems.length > 0 && (
                <ActivitySection title="Recent">
                  {terminalServerItems.map((item) => (
                    <ServerActivityRow key={item.sessionId} item={item} onOpen={() => {
                      closeDrawer();
                      navigate(`/captures/${item.sessionId}`);
                    }} />
                  ))}
                </ActivitySection>
              )}
              <Box ref={sentinelRef} sx={{ height: 1 }} />
              {activityQuery.isFetchingNextPage && <ActivityRowSkeleton />}
              {activityQuery.isFetchNextPageError && (
                <Box role="alert" sx={{ mt: 2, p: 1.5, borderRadius: 3, bgcolor: "rgba(248,113,113,.07)", border: "1px solid rgba(248,113,113,.22)" }}>
                  <Typography variant="body2" fontWeight={800}>Could not load earlier scans</Typography>
                  <Box component="button" type="button" onClick={() => void activityQuery.fetchNextPage()} sx={{ ...retryButtonSx, width: "100%", mt: 1 }}>Try again</Box>
                </Box>
              )}
            </>
          )}
        </Box>
      </SwipeableDrawer>
    </>
  );
}

function ActivitySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ pt: 2 }}>
      <Typography variant="caption" sx={{ color: "grey.500", fontWeight: 800, letterSpacing: 1.25, textTransform: "uppercase" }}>{title}</Typography>
      <Box sx={{ mt: 0.75, borderTop: "1px solid rgba(255,255,255,.06)" }}>{children}</Box>
    </Box>
  );
}

function LocalActivityRow({ capture, onOpen }: { capture: LocalCapture; onOpen: () => void }) {
  const uploading = capture.status === "uploading" || capture.status === "starting";
  const title = capture.status === "pending" ? "Waiting to upload"
    : uploading ? "Uploading photo"
      : capture.status === "needs-auth" ? "Sign in to continue"
        : "Upload needs attention";
  const subtitle = capture.status === "needs-auth" ? "Photo remains saved on this device"
    : capture.status === "failed" ? "Tap to view options"
      : "Saved on this device";
  return (
    <ActivityRow
      title={title}
      subtitle={subtitle}
      meta={timeAgo(capture.createdAt)}
      tone={capture.status === "failed" || capture.status === "needs-auth" ? "danger" : "active"}
      icon={uploading ? <CloudUploadOutlinedIcon /> : <CameraAltOutlinedIcon />}
      onOpen={onOpen}
    />
  );
}

function ServerActivityRow({ item, onOpen }: { item: PhotoActivityItem; onOpen: () => void }) {
  const presentation = item.status === "processing"
    ? { title: "Analysing photo", subtitle: "Safe to close the app", tone: "active" as const, icon: <HourglassTopOutlinedIcon /> }
    : item.status === "failed"
      ? { title: "Scan did not finish", subtitle: "Tap to view options", tone: "danger" as const, icon: <ErrorOutlineIcon /> }
      : item.status === "ingested"
        ? { title: "Added to collection", subtitle: "Scan completed", tone: "done" as const, icon: <CheckCircleOutlineIcon /> }
        : { title: "Scan ready", subtitle: item.kanjiCount == null ? "Analysis complete" : `${item.kanjiCount} kanji found`, tone: "done" as const, icon: <CheckCircleOutlineIcon /> };
  return <ActivityRow {...presentation} meta={timeAgo(item.createdAt)} onOpen={onOpen} />;
}

function ActivityRow({
  title,
  subtitle,
  meta,
  tone,
  icon,
  onOpen,
}: {
  title: string;
  subtitle: string;
  meta: string;
  tone: "active" | "done" | "danger";
  icon: React.ReactNode;
  onOpen: () => void;
}) {
  const accent = tone === "done" ? "#34d399" : tone === "danger" ? "#f87171" : "#818cf8";
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      aria-label={`${title}. ${subtitle}`}
      sx={{
        width: "100%",
        minHeight: 78,
        px: 0,
        py: 1.5,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        textAlign: "left",
        color: "inherit",
        bgcolor: "transparent",
        border: 0,
        borderBottom: "1px solid rgba(255,255,255,.07)",
        cursor: "pointer",
        "&:active": { transform: "scale(.99)" },
        "&:focus-visible": { outline: `2px solid ${accent}`, outlineOffset: -2 },
      }}
    >
      <Box sx={{ width: 48, height: 48, borderRadius: 3, display: "grid", placeItems: "center", bgcolor: `${accent}18`, color: accent, flexShrink: 0, "& svg": { fontSize: 23 } }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={800} noWrap>{title}</Typography>
        <Typography variant="body2" sx={{ color: tone === "done" ? "#6ee7b7" : tone === "active" ? "#a5b4fc" : "grey.400" }} noWrap>{subtitle}</Typography>
        <Typography variant="caption" color="text.disabled">{meta}</Typography>
      </Box>
      <ChevronRightIcon sx={{ color: "grey.700", flexShrink: 0 }} />
    </Box>
  );
}

function ActivitySkeleton() {
  return <Box sx={{ pt: 2 }}><Skeleton width={72} /><ActivityRowSkeleton /><ActivityRowSkeleton /><ActivityRowSkeleton /></Box>;
}

function ActivityRowSkeleton() {
  return (
    <Box sx={{ py: 1.5, display: "flex", gap: 1.5, alignItems: "center" }}>
      <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: 3, flexShrink: 0 }} />
      <Box sx={{ flex: 1 }}><Skeleton width="48%" /><Skeleton width="72%" /><Skeleton width="30%" /></Box>
    </Box>
  );
}

function ActivityEmpty() {
  return (
    <Box sx={{ minHeight: 330, display: "grid", placeItems: "center", textAlign: "center", px: 3 }}>
      <Box>
        <Box sx={{ width: 72, height: 72, borderRadius: "50%", display: "grid", placeItems: "center", mx: "auto", mb: 2, bgcolor: "rgba(129,140,248,.10)", color: "#818cf8" }}><CameraAltOutlinedIcon sx={{ fontSize: 34 }} /></Box>
        <Typography fontWeight={800}>No scan activity yet</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>Your saved and analysed photos will appear here.</Typography>
      </Box>
    </Box>
  );
}

const retryButtonSx = {
  minHeight: 36,
  px: 1.5,
  border: 0,
  borderRadius: 2,
  bgcolor: "#1a1a24",
  color: "#a5b4fc",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};
