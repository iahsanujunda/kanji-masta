import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Skeleton,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useSignedPhotoUrl } from "@/hooks/useSignedPhotoUrl";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import type { CaptureListResponse, CaptureSort, CaptureSummary, SortDirection } from "@/lib/photo";

const tabLabels: Record<CaptureSort, string> = {
  recent: "Recent",
  familiarity: "Familiarity",
  visited: "Recently visited",
};

export default function CaptureGallery() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sort, setSort] = useState<CaptureSort>("recent");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const query = useQuery({
    queryKey: queryKeys.captures(user?.id ?? "", sort, direction),
    queryFn: () => apiFetch<CaptureListResponse>(`/api/captures?sort=${sort}&direction=${direction}`),
    enabled: Boolean(user),
  });

  const chooseSort = (next: CaptureSort) => {
    if (next === sort) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSort(next);
      setDirection("desc");
    }
  };

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto" }}>
      <PageHeader title="Captures" subtitle="Japanese you found in everyday life" backTo="/home" />
      <Tabs
        value={sort}
        variant="scrollable"
        scrollButtons={false}
        aria-label="Sort captures"
        sx={{ px: 2, minHeight: 48, borderBottom: "1px solid", borderColor: "app.border.default", "& .MuiTab-root": { minHeight: 48, minWidth: "auto", px: 1.5, textTransform: "none", fontWeight: 700 } }}
      >
        {(Object.keys(tabLabels) as CaptureSort[]).map((key) => {
          const active = key === sort;
          const Icon = direction === "desc" ? ArrowDownwardIcon : ArrowUpwardIcon;
          return (
            <Tab
              key={key}
              value={key}
              onClick={() => chooseSort(key)}
              icon={active ? <Icon sx={{ fontSize: 15 }} /> : undefined}
              iconPosition="end"
              label={tabLabels[key]}
              aria-label={active ? `${tabLabels[key]}, ${direction === "desc" ? "descending" : "ascending"}` : tabLabels[key]}
            />
          );
        })}
      </Tabs>

      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, pb: 6 }}>
        {query.isLoading ? (
          <Box sx={{ display: "grid", gap: 1.5 }}><CaptureSkeleton /><CaptureSkeleton /><CaptureSkeleton /></Box>
        ) : query.isError ? (
          <Box role="alert" sx={{ py: 8, textAlign: "center" }}>
            <ErrorOutlineIcon sx={{ fontSize: 36, color: "error.light", mb: 1.5 }} />
            <Typography variant="h6" fontWeight={800}>Couldn’t load captures</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>Check your connection and try again.</Typography>
            <Button variant="contained" onClick={() => void query.refetch()} sx={primaryButtonSx}>Try again</Button>
          </Box>
        ) : query.data?.captures.length === 0 ? (
          <Box sx={{ py: 8, px: 3, textAlign: "center" }}>
            <Box sx={{ width: 72, height: 72, borderRadius: "50%", display: "grid", placeItems: "center", mx: "auto", mb: 2, bgcolor: "app.tone.secondary.faint", color: "secondary.light" }}>
              <CollectionsOutlinedIcon sx={{ fontSize: 34 }} />
            </Box>
            <Typography variant="h6" fontWeight={800}>Your captures will live here</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3 }}>Capture Japanese text to keep its translation and track the kanji over time.</Typography>
            <Button variant="contained" onClick={() => navigate("/capture")} sx={primaryButtonSx}>Capture Japanese</Button>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {query.data?.captures.map((capture) => (
              <CaptureCard key={capture.sessionId} capture={capture} onOpen={() => navigate(`/captures/${capture.sessionId}`)} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function CaptureCard({ capture, onOpen }: { capture: CaptureSummary; onOpen: () => void }) {
  const photo = useSignedPhotoUrl(capture.storagePath).data;
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(capture.createdAt));
  const coverageLabel = capture.totalKanji === 0 ? "Kanji coverage N/A" : `${capture.familiarKanji} / ${capture.totalKanji} familiar`;
  return (
    <Paper
      component="button"
      type="button"
      onClick={onOpen}
      variant="outlined"
      sx={{ width: "100%", p: 1.5, borderRadius: 3.5, bgcolor: "background.paper", borderColor: "app.border.default", color: "inherit", display: "flex", gap: 1.5, alignItems: "center", textAlign: "left", cursor: "pointer", minHeight: 104, "&:hover": { bgcolor: "app.surface.hoverSubtle", borderColor: "app.border.strong" }, "&:focus-visible": { outline: (theme) => `2px solid ${theme.palette.secondary.light}`, outlineOffset: 2 } }}
    >
      <Box component="img" src={photo} alt="" loading="lazy" sx={{ width: 76, height: 76, objectFit: "cover", borderRadius: 2.5, bgcolor: "background.sunken", flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography fontWeight={800} sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.35 }}>{capture.label}</Typography>
        <Typography variant="caption" color="text.disabled">{date}</Typography>
        <Box sx={{ mt: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: capture.coveragePercent === 100 ? "primary.light" : "app.accent.secondaryPale", fontWeight: 700 }}>{coverageLabel}</Typography>
            {capture.coveragePercent != null && <Typography variant="caption" color="text.disabled">{capture.coveragePercent}%</Typography>}
          </Box>
          {capture.coveragePercent != null && <LinearProgress variant="determinate" value={capture.coveragePercent} sx={{ height: 4, borderRadius: 2, bgcolor: "background.elevated", "& .MuiLinearProgress-bar": { bgcolor: capture.coveragePercent === 100 ? "primary.main" : "secondary.main" } }} />}
        </Box>
      </Box>
      <ChevronRightIcon sx={{ color: "grey.700", flexShrink: 0 }} />
    </Paper>
  );
}

function CaptureSkeleton() {
  return <Box sx={{ p: 1.5, display: "flex", gap: 1.5 }}><Skeleton variant="rounded" width={76} height={76} sx={{ borderRadius: 2.5 }} /><Box sx={{ flex: 1 }}><Skeleton width="85%" /><Skeleton width="45%" /><Skeleton width="70%" /></Box></Box>;
}

const primaryButtonSx = { minHeight: 48, bgcolor: "primary.main", color: "background.default", fontWeight: 800, "&:hover": { bgcolor: "primary.light" } };
