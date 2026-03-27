import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Paper, Skeleton, Typography } from "@mui/material";
import PageHeader from "@/components/PageHeader";
import FamiliarityDots from "@/components/FamiliarityDots";
import { apiFetch } from "@/lib/api";

interface KanjiListItem {
  id: string;
  character: string;
  familiarity: number;
  meanings: string[];
}

const ZONE_CONFIG = {
  canopy: { label: "Mastered", tier: "Tier 4-5", color: "#34d399", min: 4, max: 5 },
  trunk: { label: "Growing", tier: "Tier 2-3", color: "#818cf8", min: 2, max: 3 },
  roots: { label: "Seeded", tier: "Tier 0-1", color: "#c084fc", min: 0, max: 1 },
} as const;

type Zone = keyof typeof ZONE_CONFIG;

export default function KanjiList() {
  const [searchParams] = useSearchParams();
  const zone = (searchParams.get("zone") || "roots") as Zone;
  const config = ZONE_CONFIG[zone] || ZONE_CONFIG.roots;

  const { data: allKanji = [], isLoading: loading } = useQuery({
    queryKey: ["kanji-list"],
    queryFn: () => apiFetch<KanjiListItem[]>("/api/kanji/list"),
    staleTime: 60_000,
  });

  const kanji = allKanji.filter((k) => k.familiarity >= config.min && k.familiarity <= config.max);

  const bgTransform = {
    canopy: "scale(1.8) translate(30%, 10%)",
    trunk: "scale(1.8) translate(30%, -10%)",
    roots: "scale(1.8) translate(30%, -35%)",
  }[zone] || "scale(1.8) translate(30%, 10%)";

  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(to bottom, #1a1a24, #0a0a0f)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Zoomed tree background */}
      <Box sx={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <Box sx={{ position: "absolute", inset: 0, transform: bgTransform, opacity: 0.5, filter: "blur(1px)", transformOrigin: "center" }}>
          <TreeBackground />
        </Box>
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #0a0a0f 10%, rgba(10,10,15,0.5) 50%, rgba(10,10,15,0.1) 100%)" }} />
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0f 5%, transparent 40%)" }} />
      </Box>

      <PageHeader
        title={config.label}
        subtitle={`${kanji.length} kanji · ${config.tier}`}
        backTo="/collection"
        sx={{ position: "relative", zIndex: 1 }}
        backButtonSx={{
          bgcolor: "rgba(255,255,255,0.1)",
          "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
        }}
      />

      <Box sx={{ flex: 1, px: 3, pb: 4, position: "relative", zIndex: 1 }}>
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
                  bgcolor: "rgba(10,10,15,0.6)",
                  backdropFilter: "blur(4px)",
                  cursor: "pointer",
                  "&:hover": { bgcolor: "rgba(30,30,40,0.8)", transform: "scale(1.03)" },
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
    </Box>
  );
}

function TreeBackground() {
  return (
    <svg viewBox="0 0 400 620" style={{ width: "100%", height: "100%" }}>
      {/* Roots */}
      <g>
        <ellipse cx="210" cy="565" rx="100" ry="15" fill="#1a1a14" opacity="0.5" />
        <polygon points="100,510 120,475 145,480 150,510 125,520" fill="#4a7a2e" />
        <polygon points="120,475 140,460 155,475 145,480" fill="#6aad3e" />
        <polygon points="265,510 280,485 300,490 305,515 280,520" fill="#3d6625" />
        <polygon points="175,500 165,520 170,540 180,510" fill="#5c311c" />
        <polygon points="240,500 250,525 255,540 245,510" fill="#4a2615" />
      </g>
      {/* Trunk */}
      <g>
        <polygon points="175,430 165,280 195,260 210,280 205,430" fill="#9e6640" />
        <polygon points="170,505 175,430 205,430 215,505" fill="#8a5535" />
        <polygon points="205,430 210,280 235,275 240,300 235,430" fill="#6b3d22" />
        <polygon points="215,505 205,430 235,430 240,505" fill="#5c311c" />
        <polygon points="230,320 270,280 285,290 275,310 240,340" fill="#8a5535" />
        <polygon points="165,330 140,300 150,290 168,310" fill="#754530" />
      </g>
      {/* Canopy */}
      <g>
        <polygon points="80,240 60,180 100,130 140,150 120,230" fill="#3a6024" />
        <polygon points="100,130 120,80 170,55 190,90 140,130" fill="#558c32" />
        <polygon points="140,130 190,90 220,85 230,120 180,150" fill="#4a7a2e" />
        <polygon points="180,150 230,120 260,140 240,180" fill="#3d6625" />
        <polygon points="120,80 150,45 190,40 170,55" fill="#6aad3e" />
        <polygon points="170,55 190,40 230,50 220,85" fill="#558c32" />
        <polygon points="100,130 120,100 140,110 130,140" fill="#7cc04a" />
        <polygon points="120,80 140,60 160,70 140,100" fill="#8ed455" />
        <polygon points="130,90 145,70 155,80 142,100" fill="#a8e870" />
        <polygon points="240,180 260,140 300,160 290,210 260,220" fill="#3d6625" />
        <polygon points="290,260 305,240 325,250 320,275 300,280" fill="#3d6625" />
      </g>
    </svg>
  );
}
