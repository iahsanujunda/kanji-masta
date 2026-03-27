import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Skeleton,
  Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CheckIcon from "@mui/icons-material/Check";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

interface CurriculumItem {
  jlpt: number;
  title: string;
  subtitle: string;
  total: number;
  planted: number;
}

interface CurriculumKanjiItem {
  kanjiMasterId: string;
  character: string;
  meanings: string[];
  userStatus: "new" | "learning" | "mastered";
}

interface CurriculumDetailResponse {
  jlpt: number;
  title: string;
  total: number;
  kanji: CurriculumKanjiItem[];
}

export default function AddKanji() {
  const [selectedJlpt, setSelectedJlpt] = useState<number | null>(null);
  const [selectedKanji, setSelectedKanji] = useState<CurriculumKanjiItem | null>(null);
  const queryClient = useQueryClient();

  if (selectedJlpt !== null) {
    return (
      <CurriculumDetail
        jlpt={selectedJlpt}
        onBack={() => setSelectedJlpt(null)}
        selectedKanji={selectedKanji}
        onSelectKanji={setSelectedKanji}
        queryClient={queryClient}
      />
    );
  }

  return <CurriculumHub onSelect={setSelectedJlpt} />;
}

// =============================================================================
// View 1: Curriculum Hub
// =============================================================================

function CurriculumHub({ onSelect }: { onSelect: (jlpt: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["curriculum"],
    queryFn: () => apiFetch<{ curriculums: CurriculumItem[] }>("/api/kanji/curriculum"),
  });

  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <PageHeader title="Add Kanji" backTo="/collection" />

      <Box sx={{ flex: 1, px: 3, pb: 4, display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: "text.secondary", letterSpacing: 2, textTransform: "uppercase", px: 0.5 }}
        >
          Curriculums
        </Typography>

        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={100} sx={{ borderRadius: 4 }} />
          ))
        ) : (
          data?.curriculums.map((c) => {
            const progress = c.total > 0 ? (c.planted / c.total) * 100 : 0;

            return (
              <Paper
                key={c.jlpt}
                variant="outlined"
                onClick={() => onSelect(c.jlpt)}
                sx={{
                  borderRadius: 4,
                  p: 2.5,
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
                  <Box>
                    <Typography fontWeight="bold" sx={{ fontSize: "1.05rem" }}>{c.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{c.subtitle}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        bgcolor: "rgba(255,255,255,0.06)",
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "grey.800",
                      }}
                    >
                      <Typography variant="caption" fontWeight="bold">
                        {c.planted} <Typography component="span" variant="caption" color="text.disabled">/ {c.total}</Typography>
                      </Typography>
                    </Box>
                    <ChevronRightIcon sx={{ color: "text.disabled", fontSize: 20 }} />
                  </Box>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: "grey.800",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 3,
                      bgcolor: c.jlpt >= 4 ? "#818cf8" : "#10b981",
                    },
                  }}
                />
              </Paper>
            );
          })
        )}
      </Box>
    </Box>
  );
}

// =============================================================================
// View 2: Curriculum Detail (Kanji Grid)
// =============================================================================

function CurriculumDetail({
  jlpt,
  onBack,
  selectedKanji,
  onSelectKanji,
  queryClient,
}: {
  jlpt: number;
  onBack: () => void;
  selectedKanji: CurriculumKanjiItem | null;
  onSelectKanji: (k: CurriculumKanjiItem | null) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["curriculum-detail", jlpt],
    queryFn: () => apiFetch<CurriculumDetailResponse>(`/api/kanji/curriculum/${jlpt}`),
  });

  const handleTriage = async (status: string) => {
    if (!selectedKanji) return;
    try {
      await apiFetch("/api/kanji/add", {
        method: "POST",
        body: JSON.stringify({
          selections: [{ kanjiMasterId: selectedKanji.kanjiMasterId, status }],
        }),
      });
      onSelectKanji(null);
      queryClient.invalidateQueries({ queryKey: ["curriculum-detail", jlpt] });
      queryClient.invalidateQueries({ queryKey: ["curriculum"] });
    } catch {
      // fail silently
    }
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
      }}
    >
      <PageHeader
        title={data?.title ?? `JLPT N${jlpt}`}
        subtitle={data ? `${data.total} Characters` : "Loading..."}
        onBack={onBack}
      />

      {/* Legend */}
      <Box sx={{ px: 3, mb: 2, display: "flex", justifyContent: "flex-end", gap: 2 }}>
        {[
          { label: "New", sx: { width: 10, height: 10, borderRadius: "50%", border: "2px dotted", borderColor: "grey.500" } },
          { label: "Growing", sx: { width: 10, height: 10, borderRadius: "50%", bgcolor: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.5)" } },
          { label: "Mastered", sx: { width: 10, height: 10, borderRadius: "50%", bgcolor: "#34d399", border: "2px solid #10b981", boxShadow: "0 0 8px rgba(52,211,153,0.8)" } },
        ].map(({ label, sx }) => (
          <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={sx} />
            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, fontSize: "0.6rem", textTransform: "uppercase" }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Kanji Grid */}
      <Box sx={{ flex: 1, px: 3, pb: 4, overflow: "auto" }}>
        {isLoading ? (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5 }}>
            {[...Array(20)].map((_, i) => (
              <Skeleton key={i} variant="rounded" sx={{ aspectRatio: "1", borderRadius: 3 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5 }}>
            {data?.kanji.map((k) => (
              <KanjiCell key={k.kanjiMasterId} kanji={k} onTap={onSelectKanji} />
            ))}
          </Box>
        )}
      </Box>

      {/* Bottom Sheet */}
      {selectedKanji && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          {/* Backdrop */}
          <Box
            onClick={() => onSelectKanji(null)}
            sx={{ position: "absolute", inset: 0, bgcolor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          />

          {/* Sheet content */}
          <Box
            sx={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              maxWidth: 480,
              bgcolor: "#0f0f16",
              borderTop: "1px solid",
              borderColor: "grey.800",
              borderRadius: "24px 24px 0 0",
              p: 3,
              pb: 5,
              boxShadow: "0 -20px 50px rgba(0,0,0,0.5)",
            }}
          >
            {/* Handle */}
            <Box sx={{ width: 48, height: 5, bgcolor: "grey.800", borderRadius: 3, mx: "auto", mb: 3 }} />

            <Box sx={{ display: "flex", alignItems: "center", gap: 3, mb: 3.5 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  bgcolor: "grey.900",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid",
                  borderColor: "grey.800",
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ fontSize: 48 }}>{selectedKanji.character}</Typography>
              </Box>
              <Box>
                <Typography variant="h5" fontWeight="bold" sx={{ mb: 0.5, textTransform: "capitalize" }}>
                  {selectedKanji.meanings[0] || ""}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Unlearned · JLPT N{jlpt}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                fullWidth
                onClick={() => handleTriage("familiar")}
                startIcon={<CheckIcon />}
                sx={{
                  py: 2,
                  borderRadius: 3,
                  fontWeight: 700,
                  bgcolor: "grey.900",
                  color: "#34d399",
                  border: "2px solid",
                  borderColor: "rgba(16,185,129,0.25)",
                  "&:hover": { bgcolor: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.5)" },
                }}
              >
                Already Know
              </Button>
              <Button
                fullWidth
                onClick={() => handleTriage("learning")}
                startIcon={<StarOutlineIcon />}
                sx={{
                  py: 2,
                  borderRadius: 3,
                  fontWeight: 700,
                  bgcolor: "#4338ca",
                  color: "white",
                  border: "2px solid #6366f1",
                  boxShadow: "0 0 20px rgba(79,70,229,0.3)",
                  "&:hover": { bgcolor: "#4f46e5" },
                }}
              >
                Want to Learn
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Kanji Grid Cell
// =============================================================================

function KanjiCell({
  kanji,
  onTap,
}: {
  kanji: CurriculumKanjiItem;
  onTap: (k: CurriculumKanjiItem) => void;
}) {
  const isNew = kanji.userStatus === "new";
  const isLearning = kanji.userStatus === "learning";
  const isMastered = kanji.userStatus === "mastered";

  return (
    <Box
      component="button"
      onClick={() => isNew && onTap(kanji)}
      disabled={!isNew}
      sx={{
        aspectRatio: "1",
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: isNew ? "pointer" : "default",
        transition: "all 0.15s",
        background: "transparent",
        p: 0,

        ...(isNew && {
          border: "2px dotted",
          borderColor: "grey.500",
          color: "grey.500",
          "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "grey.300", borderColor: "grey.400" },
          "&:active": { transform: "scale(0.95)" },
        }),
        ...(isLearning && {
          bgcolor: "rgba(99,102,241,0.1)",
          border: "1px solid rgba(99,102,241,0.5)",
          color: "#a5b4fc",
          boxShadow: "inset 0 0 15px rgba(99,102,241,0.2)",
        }),
        ...(isMastered && {
          bgcolor: "rgba(16,185,129,0.1)",
          border: "2px solid rgba(16,185,129,0.8)",
          color: "#34d399",
          boxShadow: "0 0 15px rgba(16,185,129,0.15)",
        }),
      }}
    >
      <Typography sx={{ fontSize: "1.5rem", fontWeight: 500, lineHeight: 1 }}>{kanji.character}</Typography>
      {isNew && (
        <Typography
          sx={{
            fontSize: "0.55rem",
            mt: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
            px: 0.5,
            textAlign: "center",
          }}
        >
          {kanji.meanings[0] || ""}
        </Typography>
      )}
    </Box>
  );
}
