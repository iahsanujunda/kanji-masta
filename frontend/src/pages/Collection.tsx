import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Box, Typography } from "@mui/material";
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
    <svg
      viewBox="0 0 420 600"
      role="img"
      aria-label="A low-poly kanji learning tree"
      style={{
        width: "100%",
        height: "100%",
        overflow: "visible",
        filter: "drop-shadow(0 24px 28px rgba(0, 0, 0, 0.34))",
      }}
    >
      <title>Kanji learning tree</title>
      <defs>
        <linearGradient id="trunk-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9a5632" />
          <stop offset="1" stopColor="#5a2918" />
        </linearGradient>
        <linearGradient id="trunk-shadow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6c321d" />
          <stop offset="1" stopColor="#34170f" />
        </linearGradient>
        <linearGradient id="rock-lit" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#958781" />
          <stop offset="1" stopColor="#544a49" />
        </linearGradient>
        <radialGradient id="ground-fade" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#10160e" stopOpacity="0.68" />
          <stop offset="1" stopColor="#10160e" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* --- ROOTS & BASE (Tier 0-1) --- */}
      <g
        onMouseEnter={() => onHover("roots")}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: "pointer", opacity: zoneOpacity("roots"), transition: "opacity 0.45s ease" }}
      >
        <ellipse cx="215" cy="548" rx="137" ry="30" fill="url(#ground-fade)" />

        {/* Faceted stones clustered around the base. */}
        <polygon points="101,526 121,492 151,487 174,515 161,550 122,555" fill="#665e5a" />
        <polygon points="121,492 151,487 158,515 126,520" fill="#978982" />
        <polygon points="101,526 126,520 122,555 91,547" fill="#4c4644" />
        <polygon points="126,520 158,515 161,550 122,555" fill="url(#rock-lit)" />
        <polygon points="252,514 277,485 310,492 326,525 302,548 266,542" fill="#5b5750" />
        <polygon points="277,485 310,492 300,518 269,518" fill="#888078" />
        <polygon points="300,518 326,525 302,548 282,535" fill="#45443e" />
        <polygon points="174,528 197,493 225,496 243,527 228,556 188,555" fill="#695958" />
        <polygon points="197,493 225,496 215,528 184,530" fill="#a18b84" />
        <polygon points="184,530 215,528 228,556 188,555" fill="#56494a" />

        {/* Low foliage breaks up the rock line. */}
        <polygon points="79,526 92,497 119,486 137,512 124,538 96,542" fill="#355d2a" />
        <polygon points="92,497 119,486 113,513 88,519" fill="#5f8e38" />
        <polygon points="113,513 137,512 124,538 106,526" fill="#456f30" />
        <polygon points="286,523 300,498 327,492 344,514 336,540 307,543" fill="#3f682c" />
        <polygon points="300,498 327,492 320,519 295,521" fill="#69943d" />
        <polygon points="320,519 344,514 336,540 307,543" fill="#35572a" />

        {/* Roots curl over and between the stones. */}
        <path d="M183 462 C178 490 169 520 143 568 L160 554 C184 528 194 504 199 474 Z" fill="#71351f" />
        <polygon points="183,462 199,474 187,515 172,526" fill="#9a4c27" />
        <path d="M210 466 C205 510 203 544 184 579 L205 562 C221 535 224 504 227 476 Z" fill="#4d2115" />
        <polygon points="210,466 227,476 218,522 204,535" fill="#78361e" />
        <path d="M232 468 C247 496 262 521 295 553 L276 547 C247 528 229 505 218 482 Z" fill="#5d2818" />
        <polygon points="234,481 254,515 276,547 257,534" fill="#8a4022" />
        <path d="M198 485 C180 513 159 535 127 551 L151 550 C176 542 198 523 214 497 Z" fill="#542315" />
      </g>

      {/* --- TRUNK (Tier 2-3) --- */}
      <g
        onMouseEnter={() => onHover("trunk")}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: "pointer", opacity: zoneOpacity("trunk"), transition: "opacity 0.45s ease" }}
      >
        {/* Branch silhouettes sit behind the crown but remain visible beneath it. */}
        <path d="M203 331 C165 319 132 285 94 241 L108 229 C148 268 175 282 215 295 Z" fill="#512316" />
        <polygon points="108,229 151,270 176,286 158,291 122,262" fill="#813c20" />
        <path d="M218 328 C247 286 277 252 331 217 L341 229 C294 264 270 300 240 354 Z" fill="#4b2014" />
        <polygon points="230,316 272,265 331,217 300,261 248,340" fill="#8c4224" />
        <path d="M225 300 C240 257 260 222 285 190 L299 198 C279 235 260 279 245 329 Z" fill="#632a18" />

        {/* Twisting trunk: broad at the roots, narrow at the first split. */}
        <path d="M176 500 C183 458 174 424 183 379 C189 347 199 315 196 275 L225 258 C237 300 224 335 229 370 C236 415 249 454 245 500 Z" fill="url(#trunk-lit)" />
        <polygon points="176,500 183,379 199,315 207,346 199,414 204,487" fill="#a05a31" />
        <polygon points="204,487 199,414 207,346 196,275 213,266 225,372 230,493" fill="#74351e" />
        <polygon points="230,493 225,372 213,266 225,258 229,370 245,500" fill="url(#trunk-shadow)" />
        <polygon points="188,449 200,409 205,433 201,476" fill="#bc6a37" opacity="0.62" />
        <polygon points="211,352 220,307 225,345 221,389" fill="#3e1a11" opacity="0.68" />
        <polygon points="218,430 230,400 236,449 227,470" fill="#512115" opacity="0.74" />

        {/* A small leafy knot on the right, like the reference tree. */}
        <polygon points="235,331 251,303 281,299 300,320 294,350 264,361 241,347" fill="#456f2e" />
        <polygon points="251,303 281,299 273,326 243,329" fill="#739b40" />
        <polygon points="273,326 300,320 294,350 264,361" fill="#567f32" />
        <polygon points="243,329 273,326 264,361 241,347" fill="#3d6329" />
      </g>

      {/* --- CANOPY (Tier 4-5) --- */}
      <g
        onMouseEnter={() => onHover("canopy")}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: "pointer", opacity: zoneOpacity("canopy"), transition: "opacity 0.45s ease" }}
      >
        {/* Dark silhouette guarantees a single, broad windswept crown. */}
        <path
          d="M29 258 L30 207 L45 179 L38 139 L72 112 L74 77 L108 42 L151 25 L181 8 L220 22 L245 44 L267 38 L287 51 L292 73 L328 76 L350 94 L354 112 L382 126 L400 151 L397 181 L379 203 L351 202 L331 224 L294 225 L267 244 L226 235 L194 254 L151 246 L118 260 L79 250 Z"
          fill="#294822"
        />

        {/* Rear and lower shadow planes. */}
        <polygon points="29,258 30,207 76,191 95,226 79,250" fill="#355b2d" />
        <polygon points="30,207 45,179 38,139 75,126 76,191" fill="#426f35" />
        <polygon points="38,139 72,112 109,122 92,162 75,126" fill="#4e7b3a" />
        <polygon points="79,250 95,226 144,215 151,246 118,260" fill="#31552b" />
        <polygon points="95,226 121,184 169,196 144,215" fill="#507d38" />
        <polygon points="144,215 169,196 212,215 194,254 151,246" fill="#3c652f" />
        <polygon points="194,254 212,215 253,207 267,244 226,235" fill="#315328" />
        <polygon points="253,207 301,192 331,224 294,225 267,244" fill="#385d2c" />
        <polygon points="301,192 351,176 351,202 331,224" fill="#446d31" />
        <polygon points="351,176 397,181 379,203 351,202" fill="#315328" />

        {/* Left crown mass. */}
        <polygon points="74,77 108,42 135,55 117,101 72,112" fill="#587f39" />
        <polygon points="108,42 151,25 165,61 135,55" fill="#708f3b" />
        <polygon points="72,112 117,101 109,122 75,126" fill="#3f6b34" />
        <polygon points="117,101 135,55 173,83 158,125 109,122" fill="#63883e" />
        <polygon points="75,126 109,122 121,184 76,191 45,179" fill="#3f7138" />
        <polygon points="109,122 158,125 151,169 121,184" fill="#527f3b" />
        <polygon points="121,184 151,169 169,196 144,215 95,226" fill="#477435" />

        {/* High crown facets catch warm light from the upper right. */}
        <polygon points="151,25 181,8 204,36 165,61" fill="#7f983c" />
        <polygon points="181,8 220,22 222,61 204,36" fill="#8e9f3c" />
        <polygon points="165,61 204,36 211,91 173,83" fill="#778f38" />
        <polygon points="204,36 222,61 254,79 211,91" fill="#87983c" />
        <polygon points="220,22 245,44 267,38 254,79 222,61" fill="#8c993b" />
        <polygon points="267,38 287,51 292,73 254,79" fill="#778b38" />

        {/* Central crown, deliberately irregular to keep the low-poly depth. */}
        <polygon points="173,83 211,91 190,128 158,125" fill="#718b3c" />
        <polygon points="211,91 254,79 246,119 190,128" fill="#82973d" />
        <polygon points="158,125 190,128 180,172 151,169" fill="#64883c" />
        <polygon points="190,128 246,119 236,166 180,172" fill="#7e943e" />
        <polygon points="151,169 180,172 169,196 121,184" fill="#5b853d" />
        <polygon points="180,172 236,166 253,207 212,215 169,196" fill="#6d8d3c" />
        <polygon points="236,166 278,158 301,192 253,207" fill="#668638" />

        {/* Right crown steps down in overlapping clusters. */}
        <polygon points="254,79 292,73 328,76 315,111 280,105" fill="#83963b" />
        <polygon points="254,79 280,105 246,119" fill="#748b36" />
        <polygon points="280,105 315,111 298,143 260,137 246,119" fill="#8b9a3e" />
        <polygon points="328,76 350,94 354,112 315,111" fill="#82923a" />
        <polygon points="315,111 354,112 340,145 298,143" fill="#778c37" />
        <polygon points="260,137 298,143 278,158 236,166" fill="#6f8938" />
        <polygon points="298,143 340,145 351,176 301,192 278,158" fill="#7e933b" />
        <polygon points="354,112 382,126 369,158 340,145" fill="#8c9b3d" />
        <polygon points="382,126 400,151 397,181 369,158" fill="#7e9239" />
        <polygon points="340,145 369,158 351,176" fill="#6e8735" />

        {/* Sparse highlight faces echo the sunlit prototype without turning neon. */}
        <polygon points="135,55 165,61 173,83 148,76" fill="#889a42" opacity="0.88" />
        <polygon points="211,91 246,119 222,118" fill="#92a142" opacity="0.74" />
        <polygon points="298,143 340,145 322,158" fill="#94a241" opacity="0.65" />
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

    </Box>
  );
}
