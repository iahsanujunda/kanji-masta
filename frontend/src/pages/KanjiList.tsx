import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Paper, Skeleton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CollectionTree from "@/components/artwork/CollectionTree";
import PageHeader from "@/components/PageHeader";
import FamiliarityDots from "@/components/FamiliarityDots";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";

interface KanjiListItem {
  id: string;
  character: string;
  familiarity: number;
  meanings: string[];
}

const ZONE_CONFIG = {
  canopy: { label: "Mastered", tier: "Tier 4-5", color: "primary.light", min: 4, max: 5, level: 5 as number | null },
  trunk: { label: "Growing", tier: "Tier 2-3", color: "secondary.light", min: 2, max: 3, level: null as number | null },
  roots: { label: "Seeded", tier: "Tier 0-1", color: "app.accent.purpleLight", min: 0, max: 1, level: 0 as number | null },
} as const;

type Zone = keyof typeof ZONE_CONFIG;

const ZONE_TRANSFORMS: Record<Zone, string> = {
  canopy: "translate3d(0, 120px, 0) scale(2.15)",
  trunk: "translate3d(-12px, -80px, 0) scale(2.2)",
  roots: "translate3d(0, -245px, 0) scale(2.15)",
};

export default function KanjiList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const zone = (searchParams.get("zone") || "roots") as Zone;
  const config = ZONE_CONFIG[zone] || ZONE_CONFIG.roots;
  const [treeFocused, setTreeFocused] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setTreeFocused(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const { data: allKanji = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.kanjiList(user?.id ?? ""),
    queryFn: () => apiFetch<KanjiListItem[]>("/api/kanji/list"),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const kanji = allKanji.filter((k) => k.familiarity >= config.min && k.familiarity <= config.max);

  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        background: (theme) => `linear-gradient(to bottom, ${theme.palette.background.elevated}, ${theme.palette.background.sunken})`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Fixed tree backdrop starts whole, then zooms into the selected learning zone. */}
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          width: "100%",
          maxWidth: 480,
          mx: "auto",
          zIndex: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <Box
          data-testid="zone-tree-backdrop"
          data-zone={zone}
          sx={{
            position: "absolute",
            inset: 0,
            transform: treeFocused
              ? ZONE_TRANSFORMS[zone]
              : "translate3d(0, 32px, 0) scale(1)",
            transformOrigin: "50% 50%",
            opacity: treeFocused ? 0.42 : 1,
            filter: "blur(0.6px) saturate(0.9)",
            transition: "transform 900ms cubic-bezier(0.16, 1, 0.3, 1), opacity 700ms ease-out",
            willChange: "transform, opacity",
            "@media (prefers-reduced-motion: reduce)": {
              transition: "none",
            },
          }}
        >
          <CollectionTree hoveredZone={null} />
        </Box>
        <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to right, ${alpha(theme.palette.background.sunken, 0.96)} 4%, ${alpha(theme.palette.background.sunken, 0.5)} 55%, ${alpha(theme.palette.background.sunken, 0.24)} 100%)` }} />
        <Box sx={{ position: "absolute", inset: 0, background: (theme) => `linear-gradient(to top, ${theme.palette.background.sunken} 0%, ${alpha(theme.palette.background.sunken, 0.2)} 48%, ${alpha(theme.palette.background.sunken, 0.5)} 100%)` }} />
      </Box>

      <PageHeader
        title={config.label}
        subtitle={`${kanji.length} kanji · ${config.tier}`}
        backTo="/collection"
        sx={{ position: "relative", zIndex: 1 }}
        backButtonSx={{
          bgcolor: "app.overlay.subtle",
          "&:hover": { bgcolor: "app.overlay.strong" },
        }}
      />

      <Box sx={{ flex: 1, px: 3, pb: config.level !== null ? 2 : 4, position: "relative", zIndex: 1 }}>
        {loading ? (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="rounded" sx={{ aspectRatio: "1", borderRadius: 3 }} />
            ))}
          </Box>
        ) : kanji.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography color="text.secondary">No kanji in this tier yet</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
            {kanji.map((k) => (
              <Paper
                key={k.id}
                sx={{
                  aspectRatio: "1",
                  borderRadius: 3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid",
                  borderColor: `${config.color}33`,
                  bgcolor: (theme) => alpha(theme.palette.background.sunken, 0.6),
                  backdropFilter: "blur(4px)",
                  cursor: "pointer",
                  "&:hover": { bgcolor: (theme) => alpha(theme.palette.background.hover, 0.8), transform: "scale(1.03)" },
                  transition: "all 0.2s",
                }}
              >
                <Typography sx={{ fontSize: "2rem", fontWeight: 500, mb: 1 }}>{k.character}</Typography>
                <FamiliarityDots value={k.familiarity} color={config.color} />
              </Paper>
            ))}
          </Box>
        )}
      </Box>

      {config.level !== null && (
        <Box sx={{ px: 3, pb: 4, pt: 2, position: "relative", zIndex: 1 }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={() => navigate(`/kanji/add?level=${config.level}`)}
            sx={{
              bgcolor: config.color,
              color: zone === "canopy" ? "black" : "white",
              fontWeight: 700,
              py: 1.5,
              borderRadius: 3,
              boxShadow: `0 0 30px ${config.color}4D`,
              "&:hover": { filter: "brightness(1.1)" },
            }}
          >
            Add Kanji
          </Button>
        </Box>
      )}
    </Box>
  );
}
