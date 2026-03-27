import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Button, Typography } from "@mui/material";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

interface KanjiItem {
  familiarity: number;
}

type Zone = "canopy" | "trunk" | "roots" | null;

function TreeSvg({
  hoveredZone,
  onHover,
}: {
  hoveredZone: Zone;
  onHover: (zone: Zone) => void;
}) {
  const zoneOpacity = (zone: Zone) => {
    if (!hoveredZone) return 1;
    return hoveredZone === zone ? 1 : 0.3;
  };

  return (
    <svg viewBox="0 0 400 620" style={{ width: "100%", height: "100%", overflow: "visible" }}>
      {/* --- ROOTS & BASE (Tier 0-1) --- */}
      <g
        onMouseEnter={() => onHover("roots")}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: "pointer", opacity: zoneOpacity("roots"), transition: "opacity 0.5s" }}
      >
        <ellipse cx="210" cy="565" rx="100" ry="15" fill="#1a1a14" opacity="0.5" />
        <polygon points="115,530 135,505 155,510 160,535 130,545" fill="#7a6e6a" />
        <polygon points="135,505 150,495 155,510" fill="#908480" />
        <polygon points="115,530 130,545 105,540" fill="#625856" />
        <polygon points="260,535 280,515 300,525 290,545 265,548" fill="#6e6462" />
        <polygon points="280,515 295,508 300,525" fill="#857a78" />
        <polygon points="100,510 120,475 145,480 150,510 125,520" fill="#4a7a2e" />
        <polygon points="120,475 140,460 155,475 145,480" fill="#6aad3e" />
        <polygon points="100,510 110,490 120,475" fill="#3d6625" />
        <polygon points="145,480 155,475 165,495 150,510" fill="#558c32" />
        <polygon points="140,460 160,455 155,475" fill="#7cc04a" />
        <polygon points="265,510 280,485 300,490 305,515 280,520" fill="#3d6625" />
        <polygon points="280,485 295,475 305,490 300,490" fill="#558c32" />
        <polygon points="265,510 270,495 280,485" fill="#2d4a1b" />
        <polygon points="300,490 310,485 305,515" fill="#4a7a2e" />
        <polygon points="155,530 170,510 190,515 185,535 160,540" fill="#4a7a2e" />
        <polygon points="170,510 185,500 190,515" fill="#6aad3e" />
        <polygon points="175,500 165,520 170,540 180,510" fill="#5c311c" />
        <polygon points="240,500 250,525 255,540 245,510" fill="#4a2615" />
        <polygon points="200,505 195,530 200,545 210,535 205,505" fill="#5c311c" />
      </g>

      {/* --- TRUNK (Tier 2-3) --- */}
      <g
        onMouseEnter={() => onHover("trunk")}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: "pointer", opacity: zoneOpacity("trunk"), transition: "opacity 0.5s" }}
      >
        <polygon points="170,505 160,430 155,350 165,280 175,430" fill="#8a5535" />
        <polygon points="175,430 160,430 170,505" fill="#754530" />
        <polygon points="175,430 165,280 195,260 210,280 205,430" fill="#9e6640" />
        <polygon points="170,505 175,430 205,430 215,505" fill="#8a5535" />
        <polygon points="205,430 210,280 235,275 240,300 235,430" fill="#6b3d22" />
        <polygon points="215,505 205,430 235,430 240,505" fill="#5c311c" />
        <polygon points="235,430 240,300 250,310 245,430" fill="#4a2615" />
        <polygon points="240,505 235,430 245,430 248,505" fill="#4a2615" />
        <polygon points="180,400 185,360 195,365 190,405" fill="#b07848" opacity="0.6" />
        <polygon points="185,470 190,445 200,448 195,475" fill="#b07848" opacity="0.4" />
        <polygon points="230,320 270,280 285,290 275,310 240,340" fill="#8a5535" />
        <polygon points="270,280 290,265 300,280 285,290" fill="#6b3d22" />
        <polygon points="285,290 300,280 310,295 295,310" fill="#5c311c" />
        <polygon points="240,340 275,310 295,310 260,350" fill="#4a2615" />
        <polygon points="165,330 140,300 150,290 168,310" fill="#754530" />
        <polygon points="140,300 130,290 145,280 150,290" fill="#5c311c" />
      </g>

      {/* --- CANOPY (Tier 4-5) --- */}
      <g
        onMouseEnter={() => onHover("canopy")}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: "pointer", opacity: zoneOpacity("canopy"), transition: "opacity 0.5s" }}
      >
        <polygon points="100,280 80,220 120,180 160,200 140,270" fill="#2d4a1b" />
        <polygon points="250,250 280,200 320,220 310,270 270,280" fill="#2d4a1b" />
        <polygon points="160,200 120,180 150,140 200,160" fill="#345520" />
        <polygon points="80,240 60,180 100,130 140,150 120,230" fill="#3a6024" />
        <polygon points="60,180 80,120 120,100 100,130" fill="#456929" />
        <polygon points="120,230 140,150 170,170 160,240" fill="#4a7a2e" />
        <polygon points="100,130 120,80 170,55 190,90 140,130" fill="#558c32" />
        <polygon points="140,130 190,90 220,85 230,120 180,150" fill="#4a7a2e" />
        <polygon points="180,150 230,120 260,140 240,180" fill="#3d6625" />
        <polygon points="120,230 140,150 180,150 200,200 160,240" fill="#4a7a2e" />
        <polygon points="200,200 180,150 240,180 250,210" fill="#456929" />
        <polygon points="160,240 200,200 250,210 230,260" fill="#3a6024" />
        <polygon points="240,180 260,140 300,160 290,210 260,220" fill="#3d6625" />
        <polygon points="260,220 290,210 310,240 290,270" fill="#2d4a1b" />
        <polygon points="290,210 300,160 330,200 310,240" fill="#345520" />
        <polygon points="290,260 305,240 325,250 320,275 300,280" fill="#3d6625" />
        <polygon points="305,240 320,230 330,245 325,250" fill="#4a7a2e" />
        <polygon points="120,80 150,45 190,40 170,55" fill="#6aad3e" />
        <polygon points="170,55 190,40 230,50 220,85" fill="#558c32" />
        <polygon points="190,40 220,35 240,55 230,50" fill="#6aad3e" />
        <polygon points="220,85 230,50 260,70 260,100" fill="#456929" />
        <polygon points="260,100 260,70 280,95 270,120" fill="#3d6625" />
        <polygon points="230,120 260,100 270,120 260,140" fill="#345520" />
        <polygon points="100,130 120,100 140,110 130,140" fill="#7cc04a" />
        <polygon points="120,80 140,60 160,70 140,100" fill="#8ed455" />
        <polygon points="140,60 165,48 175,65 160,70" fill="#9be060" />
        <polygon points="120,100 140,110 140,130" fill="#6aad3e" />
        <polygon points="80,180 100,150 120,170 100,195" fill="#6aad3e" />
        <polygon points="130,90 145,70 155,80 142,100" fill="#a8e870" />
        <polygon points="90,160 105,140 115,155" fill="#84c44e" />
        <polygon points="110,285 95,260 115,245 135,255 130,280" fill="#4a7a2e" />
        <polygon points="95,260 105,240 115,245" fill="#6aad3e" />
        <polygon points="115,245 130,235 140,250 135,255" fill="#558c32" />
      </g>
    </svg>
  );
}

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
        title="Your Tree"
        subtitle={`${collection.total} Kanji in Ecosystem`}
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
          <TreeSvg hoveredZone={hoveredZone} onHover={setHoveredZone} />
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

      {/* Bottom action */}
      <Box sx={{ px: 3, pb: 4, pt: 2, zIndex: 20 }}>
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={() => navigate("/kanji/add")}
          sx={{
            bgcolor: "#4338ca",
            fontWeight: "bold",
            py: 1.5,
            borderRadius: 3,
            "&:hover": { bgcolor: "#3730a3" },
          }}
        >
          Add Familiar Kanji
        </Button>
      </Box>
    </Box>
  );
}