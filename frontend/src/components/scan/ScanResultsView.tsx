import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Box, Button, Paper, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import StarIcon from "@mui/icons-material/Star";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import PageHeader from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import type { EnrichedKanji } from "@/lib/photo";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";

interface ScanResultsViewProps {
  sessionId: string;
  kanji: EnrichedKanji[];
}

export default function ScanResultsView({ sessionId, kanji }: ScanResultsViewProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<Record<string, "familiar" | "learning" | null>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveSelections = useMutation({
    mutationFn: (selected: Array<{ kanjiMasterId: string; status: "familiar" | "learning" }>) =>
      apiFetch("/api/kanji/session", {
        method: "POST",
        body: JSON.stringify({ sessionId, selections: selected }),
      }),
    onSuccess: async () => {
      if (!user) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.userSummary(user.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.kanjiList(user.id) }),
      ]);
    },
  });

  const toggle = (character: string, status: "familiar" | "learning") => {
    setSelections((current) => ({
      ...current,
      [character]: current[character] === status ? null : status,
    }));
  };

  const save = async () => {
    const selected = Object.entries(selections)
      .filter((entry): entry is [string, "familiar" | "learning"] => entry[1] != null)
      .map(([character, status]) => ({
        kanjiMasterId: kanji.find((item) => item.character === character)?.kanjiMasterId ?? "",
        status,
      }))
      .filter((item) => item.kanjiMasterId);

    setSaving(true);
    setError(null);
    try {
      if (selected.length > 0) {
        await saveSelections.mutateAsync(selected);
      }
      navigate("/home", {
        state: { quizGenerating: selected.some((item) => item.status === "learning") },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Selections could not be saved.");
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Found Kanji" subtitle={`${kanji.length} detected`} backTo="/home" />
      <Box sx={{ flex: 1, px: 3, pb: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        {error && <Typography role="alert" color="error.light">{error}</Typography>}
        {kanji.map((item) => {
          const selected = selections[item.character];
          return (
            <Paper key={item.character} variant="outlined" sx={{ borderRadius: 4, p: 2.5, position: "relative", overflow: "hidden", bgcolor: "background.paper" }}>
              {item.recommended && (
                <Box sx={{ position: "absolute", top: 0, right: 0, px: 1.5, py: 0.5, bgcolor: "secondary.main", display: "flex", alignItems: "center", gap: 0.5, borderBottomLeftRadius: 12 }}>
                  <StarIcon sx={{ fontSize: 13 }} />
                  <Typography variant="caption" fontWeight={700}>Recommended</Typography>
                </Box>
              )}
              <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2.5, pt: item.recommended ? 1 : 0 }}>
                <Box sx={{ width: 72, height: 72, flexShrink: 0, display: "grid", placeItems: "center", bgcolor: "background.sunken", border: "1px solid", borderColor: "app.border.default", borderRadius: 3 }}>
                  <Typography sx={{ fontSize: 42 }}>{item.character}</Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: "secondary.light", fontWeight: 700, letterSpacing: 1.5 }}>{item.onyomi.join("、")}</Typography>
                  <Typography variant="h6" fontWeight={700}>{item.meanings[0] ?? ""}</Typography>
                  {item.whyUseful && <Typography variant="body2" color="text.secondary">{item.whyUseful}</Typography>}
                </Box>
              </Box>
              {item.exampleWords[0] && (
                <Box sx={{ p: 1.5, mb: 2, bgcolor: "background.sunken", borderRadius: 2 }}>
                  <Typography variant="body2">
                    {item.exampleWords[0].word} · {item.exampleWords[0].reading}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{item.exampleWords[0].meaning}</Typography>
                </Box>
              )}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                <Button
                  onClick={() => toggle(item.character, "familiar")}
                  startIcon={<CheckIcon />}
                  aria-pressed={selected === "familiar"}
                  sx={{ minHeight: 48, color: selected === "familiar" ? "primary.light" : "text.secondary", border: "1px solid", borderColor: selected === "familiar" ? "app.tone.primary.strongBorder" : "background.elevated", bgcolor: selected === "familiar" ? "app.tone.primary.subtle" : "transparent" }}
                >
                  Already know
                </Button>
                <Button
                  onClick={() => toggle(item.character, "learning")}
                  startIcon={<StarOutlineIcon />}
                  aria-pressed={selected === "learning"}
                  sx={{ minHeight: 48, color: selected === "learning" ? "white" : "text.secondary", border: "1px solid", borderColor: selected === "learning" ? "secondary.light" : "background.elevated", bgcolor: selected === "learning" ? "secondary.main" : "transparent" }}
                >
                  Learn
                </Button>
              </Box>
            </Paper>
          );
        })}
      </Box>
      <Box sx={{ position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "center", pb: "max(24px, env(safe-area-inset-bottom))", pt: 5, background: (theme) => `linear-gradient(transparent, ${theme.palette.background.default} 40%)`, pointerEvents: "none" }}>
        <Button
          variant="contained"
          disabled={saving}
          onClick={() => void save()}
          sx={{ pointerEvents: "auto", width: "calc(100% - 48px)", maxWidth: 432, minHeight: 52, borderRadius: 8, bgcolor: "primary.main", color: "background.default", fontWeight: 700, "&:hover": { bgcolor: "primary.light" } }}
        >
          {saving ? "Saving…" : "Done"}
        </Button>
      </Box>
    </Box>
  );
}
