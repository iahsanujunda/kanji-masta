import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Typography } from "@mui/material";
import CollectionTree from "@/components/CollectionTree";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

interface KanjiItem {
  familiarity: number;
}

type Zone = "canopy" | "trunk" | "roots" | null;

function ZoneBadge({
  zone,
  label,
  count,
  tier,
  color,
  hoveredZone,
  onHover,
  onClick,
  sx,
}: {
  zone: Zone;
  label: string;
  count: number;
  tier: string;
  color: string;
  hoveredZone: Zone;
  onHover: (zone: Zone) => void;
  onClick?: () => void;
  sx: object;
}) {
  const isHovered = hoveredZone === zone;
  const isDimmed = hoveredZone !== null && !isHovered;

  return (
    <Box
      onMouseEnter={() => onHover(zone)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      sx={{
        position: "absolute",
        zIndex: 10,
        cursor: "pointer",
        transition: "all 0.5s ease-out",
        transform: isHovered ? "scale(1.05)" : "scale(1)",
        opacity: isDimmed ? 0.2 : 1,
        ...sx,
      }}
    >
      <Box
        sx={{
          bgcolor: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.2)",
          p: 2,
          borderRadius: 3,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            color,
            textTransform: "uppercase",
            letterSpacing: 2,
            display: "block",
            mb: 0.5,
          }}
        >
          {label}
        </Typography>
        <Typography variant="h4" fontWeight={900} color="white">
          {count}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "grey.500", fontFamily: "monospace", mt: 0.5, display: "block" }}
        >
          {tier}
        </Typography>
      </Box>
    </Box>
  );
}

export default function Collection() {
  const navigate = useNavigate();
  const [hoveredZone, setHoveredZone] = useState<Zone>(null);

  const { data: kanjiList = [] } = useQuery({
    queryKey: ["kanji-list"],
    queryFn: () => apiFetch<KanjiItem[]>("/api/kanji/list"),
    staleTime: 60_000,
  });

  const collection = {
    total: kanjiList.length,
    canopy: { count: kanjiList.filter((k) => k.familiarity >= 4).length, label: "Mastered", tier: "Tier 4-5" },
    trunk: { count: kanjiList.filter((k) => k.familiarity >= 2 && k.familiarity <= 3).length, label: "Growing", tier: "Tier 2-3" },
    roots: { count: kanjiList.filter((k) => k.familiarity <= 1).length, label: "Seeded", tier: "Tier 0-1" },
  };

  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(to bottom, #1a1a24, #0a0a0f)",
      }}
    >
      <PageHeader
        title="Your Kanji"
        subtitle={`${collection.total} Kanji`}
        backTo="/home"
        sx={{ zIndex: 20 }}
        backButtonSx={{
          bgcolor: "rgba(255,255,255,0.1)",
          "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
        }}
      />

      {/* Tree + badges container */}
      <Box sx={{ flex: 1, position: "relative", width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* SVG tree */}
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", transform: "translateY(-16px)" }}>
          <CollectionTree hoveredZone={hoveredZone} onHover={setHoveredZone} />
        </Box>

        {/* Canopy badge */}
        <ZoneBadge
          zone="canopy"
          label={collection.canopy.label}
          count={collection.canopy.count}
          tier={collection.canopy.tier}
          color="#34d399"
          hoveredZone={hoveredZone}
          onHover={setHoveredZone}
          onClick={() => navigate("/collection/list?zone=canopy")}
          sx={{ top: "18%", left: 32 }}
        />

        {/* Trunk badge */}
        <ZoneBadge
          zone="trunk"
          label={collection.trunk.label}
          count={collection.trunk.count}
          tier={collection.trunk.tier}
          color="#818cf8"
          hoveredZone={hoveredZone}
          onHover={setHoveredZone}
          onClick={() => navigate("/collection/list?zone=trunk")}
          sx={{ top: "50%", right: 32 }}
        />

        {/* Roots badge */}
        <ZoneBadge
          zone="roots"
          label={collection.roots.label}
          count={collection.roots.count}
          tier={collection.roots.tier}
          color="#c084fc"
          hoveredZone={hoveredZone}
          onHover={setHoveredZone}
          onClick={() => navigate("/collection/list?zone=roots")}
          sx={{ bottom: "10%", left: 48 }}
        />
      </Box>

    </Box>
  );
}
