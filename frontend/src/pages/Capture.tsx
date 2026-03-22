import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import StarIcon from "@mui/icons-material/Star";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import CloseIcon from "@mui/icons-material/Close";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

interface ExampleWord {
  word: string;
  reading: string;
  meaning: string;
}

interface EnrichedKanji {
  kanjiMasterId: string | null;
  character: string;
  recommended: boolean;
  whyUseful: string;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  frequency: number | null;
  exampleWords: ExampleWord[];
}

interface PhotoSessionResult {
  sessionId: string;
  status: "processing" | "done" | "error" | "not_found";
  kanji?: EnrichedKanji[];
}

type View = "idle" | "uploading" | "analyzing" | "results";

export default function Capture() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("idle");
  const [statusText, setStatusText] = useState("Uploading photo...");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [kanjiResults, setKanjiResults] = useState<EnrichedKanji[]>([]);
  const [selections, setSelections] = useState<Record<string, string | null>>({});

  // Trigger file input on mount
  useEffect(() => {
    fileInputRef.current?.click();
  }, []);

  const handleError = useCallback((message: string) => {
    navigate("/", { state: { error: message } });
  }, [navigate]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      navigate("/");
      return;
    }

    setView("uploading");
    setStatusText("Uploading photo...");

    try {
      const userId = auth.currentUser!.uid;
      const storageRef = ref(storage, `photos/${userId}/${crypto.randomUUID()}.jpg`);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);

      setView("analyzing");
      setStatusText("AI is scanning image...");

      const result = await apiFetch<{ sessionId: string; status: string }>("/api/photo/analyze", {
        method: "POST",
        body: JSON.stringify({ imageUrl }),
      });

      setSessionId(result.sessionId);
    } catch (err) {
      handleError(err instanceof Error ? err.message : "Failed to upload photo");
    }
  }, [navigate, handleError]);

  // Poll for results
  useEffect(() => {
    if (!sessionId || view !== "analyzing") return;

    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;

      // Update status text as we wait
      if (pollCount === 2) setStatusText("Extracting kanji...");
      if (pollCount === 4) setStatusText("Finding daily usage...");
      if (pollCount > 30) {
        clearInterval(interval);
        handleError("Analysis timed out. Please try again.");
        return;
      }

      try {
        const result = await apiFetch<PhotoSessionResult>(`/api/photo/session/${sessionId}`);
        if (result.status === "done" && result.kanji) {
          setKanjiResults(result.kanji);
          setView("results");
          clearInterval(interval);
        } else if (result.status === "error") {
          clearInterval(interval);
          handleError("Analysis failed. Please try again.");
        }
      } catch {
        // Keep polling on network errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, view, handleError]);

  const toggleSelection = (character: string, type: string) => {
    setSelections((prev) => ({
      ...prev,
      [character]: prev[character] === type ? null : type,
    }));
  };

  const handleDone = async () => {
    if (!sessionId) return;

    const selected = Object.entries(selections)
      .filter(([, status]) => status !== null)
      .map(([character, status]) => {
        const kanji = kanjiResults.find((k) => k.character === character);
        return { kanjiMasterId: kanji?.kanjiMasterId ?? "", status: status! };
      })
      .filter((s) => s.kanjiMasterId);

    if (selected.length > 0) {
      try {
        await apiFetch("/api/kanji/session", {
          method: "POST",
          body: JSON.stringify({ sessionId, selections: selected }),
        });
      } catch (err) {
        handleError(err instanceof Error ? err.message : "Failed to save selections");
        return;
      }
    }

    navigate("/");
  };

  // --- Loading View ---
  if (view === "uploading" || view === "analyzing") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          maxWidth: 480,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 256,
            height: 256,
            bgcolor: "rgba(67, 56, 202, 0.15)",
            borderRadius: "50%",
            filter: "blur(48px)",
          }}
        />
        <Box sx={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <Box
            sx={{
              width: 80,
              height: 80,
              bgcolor: "grey.900",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid",
              borderColor: "grey.700",
              mx: "auto",
              mb: 3,
              position: "relative",
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 40, color: "#818cf8" }} />
            <CircularProgress
              size={80}
              thickness={2}
              sx={{
                position: "absolute",
                color: "#4338ca",
              }}
            />
          </Box>
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
            Analyzing Capture
          </Typography>
          <Typography variant="body2" sx={{ color: "#818cf8" }}>
            {statusText}
          </Typography>
        </Box>
      </Box>
    );
  }

  // --- Results View ---
  if (view === "results") {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          maxWidth: 480,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <PageHeader
          title="Found Kanji"
          subtitle={`${kanjiResults.length} detected`}
          right={
            <Button
              onClick={() => navigate("/")}
              sx={{ minWidth: 0, p: 1, color: "grey.400" }}
            >
              <CloseIcon />
            </Button>
          }
        />

        <Box sx={{ flex: 1, px: 3, pb: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 2.5 }}>
          {kanjiResults.map((kanji) => {
            const status = selections[kanji.character];

            return (
              <Paper
                key={kanji.character}
                sx={{
                  borderRadius: 4,
                  p: 2.5,
                  border: "1px solid",
                  borderColor: "grey.800",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {kanji.recommended && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      bgcolor: "#4338ca",
                      px: 1.5,
                      py: 0.5,
                      borderBottomLeftRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    <StarIcon sx={{ fontSize: 12, color: "white" }} />
                    <Typography variant="caption" sx={{ color: "white", fontWeight: 700, fontSize: "0.65rem" }}>
                      Recommended
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: "flex", gap: 2.5, mb: 2.5 }}>
                  <Box
                    sx={{
                      bgcolor: "grey.900",
                      borderRadius: 3,
                      width: 80,
                      height: 80,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      border: "1px solid",
                      borderColor: "grey.800",
                    }}
                  >
                    <Typography sx={{ fontSize: 48 }}>{kanji.character}</Typography>
                  </Box>

                  <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <Typography
                      variant="caption"
                      sx={{ color: "#818cf8", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", mb: 0.5 }}
                    >
                      {kanji.onyomi.join("、")}
                    </Typography>
                    <Typography variant="h6" fontWeight="bold" sx={{ textTransform: "capitalize", lineHeight: 1.2, mb: 1 }}>
                      {kanji.meanings[0] || ""}
                    </Typography>
                    {kanji.exampleWords[0] && (
                      <Box sx={{ bgcolor: "rgba(0,0,0,0.3)", px: 1.5, py: 1, borderRadius: 2, border: "1px solid", borderColor: "grey.800" }}>
                        <Typography variant="body2" component="span" sx={{ mr: 1 }}>
                          {kanji.exampleWords[0].word}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ({kanji.exampleWords[0].meaning})
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: "flex", gap: 1.5 }}>
                  <Button
                    fullWidth
                    onClick={() => toggleSelection(kanji.character, "familiar")}
                    startIcon={<CheckIcon sx={{ fontSize: 16 }} />}
                    sx={{
                      py: 1.25,
                      borderRadius: 2,
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      border: "2px solid",
                      ...(status === "familiar"
                        ? {
                            bgcolor: "rgba(16, 185, 129, 0.15)",
                            color: "#34d399",
                            borderColor: "rgba(16, 185, 129, 0.4)",
                          }
                        : {
                            bgcolor: "grey.900",
                            color: "grey.400",
                            borderColor: "transparent",
                            "&:hover": { bgcolor: "grey.800" },
                          }),
                    }}
                  >
                    Already Know
                  </Button>

                  <Button
                    fullWidth
                    onClick={() => toggleSelection(kanji.character, "learning")}
                    startIcon={<StarOutlineIcon sx={{ fontSize: 16 }} />}
                    sx={{
                      py: 1.25,
                      borderRadius: 2,
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      border: "2px solid",
                      ...(status === "learning"
                        ? {
                            bgcolor: "#4338ca",
                            color: "white",
                            borderColor: "#818cf8",
                            boxShadow: "0 0 15px rgba(79, 70, 229, 0.4)",
                          }
                        : {
                            bgcolor: "grey.900",
                            color: "grey.300",
                            borderColor: "transparent",
                            "&:hover": { bgcolor: "grey.800" },
                          }),
                    }}
                  >
                    Want to Learn
                  </Button>
                </Box>
              </Paper>
            );
          })}
        </Box>

        <Box
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            pb: 4,
            pt: 6,
            background: (theme) =>
              `linear-gradient(transparent, ${theme.palette.background.default} 40%)`,
            pointerEvents: "none",
          }}
        >
          <Button
            onClick={handleDone}
            variant="contained"
            size="large"
            sx={{
              pointerEvents: "auto",
              maxWidth: 480 - 48,
              width: "100%",
              mx: 3,
              py: 2,
              borderRadius: 8,
              fontSize: "1.1rem",
              fontWeight: "bold",
              bgcolor: "grey.100",
              color: "grey.900",
              "&:hover": { bgcolor: "grey.300" },
            }}
          >
            Done
          </Button>
        </Box>
      </Box>
    );
  }

  // --- Idle View (file picker only, no visible UI needed) ---
  return (
    <Box
      sx={{
        minHeight: "100vh",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFileChange}
      />
      <Button variant="outlined" onClick={() => fileInputRef.current?.click()}>
        Select Photo
      </Button>
      <Button sx={{ mt: 1 }} onClick={() => navigate("/")}>
        Cancel
      </Button>
    </Box>
  );
}
