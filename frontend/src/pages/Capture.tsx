import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, LinearProgress, Typography } from "@mui/material";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import PageHeader from "@/components/PageHeader";
import { saveLocalCapture } from "@/lib/captureQueue";
import { supabase } from "@/lib/supabase";

type CaptureView = "selecting" | "saving" | "save-failed";

export default function Capture() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openedPicker = useRef(false);
  const [view, setView] = useState<CaptureView>("selecting");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState("This photo is not saved yet.");

  useEffect(() => {
    if (openedPicker.current) return;
    openedPicker.current = true;
    fileInputRef.current?.click();
  }, []);

  const persistFile = useCallback(async (file: File) => {
    setView("saving");
    setPendingFile(file);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Please sign in again before saving this photo.");

      const clientCaptureId = crypto.randomUUID();
      await saveLocalCapture({
        id: clientCaptureId,
        userId: user.id,
        blob: file,
        storagePath: `${user.id}/${clientCaptureId}.jpg`,
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
      });
      navigate(`/captures/${clientCaptureId}`, { replace: true });
    } catch (cause) {
      const message = typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string"
        ? cause.message
        : "This photo could not be saved on this device.";
      setError(message);
      setView("save-failed");
    }
  }, [navigate]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      navigate("/home");
      return;
    }
    void persistFile(file);
  }, [navigate, persistFile]);

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column" }}>
      <PageHeader title="New scan" backTo="/home" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFileChange}
      />

      <Box sx={{ flex: 1, px: 3, pb: 6, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {view === "saving" ? (
          <Box role="status" aria-live="polite">
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Saving photo…</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Keep this screen open for a moment.
            </Typography>
            <LinearProgress
              aria-label="Saving photo"
              sx={{ height: 4, borderRadius: 2, bgcolor: "#1a1a24", "& .MuiLinearProgress-bar": { bgcolor: "#10b981" } }}
            />
          </Box>
        ) : view === "save-failed" ? (
          <Box role="alert">
            <ErrorOutlineIcon sx={{ color: "error.light", fontSize: 36, mb: 2 }} />
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Photo not saved</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>{error}</Typography>
            <Button
              fullWidth
              variant="contained"
              disabled={!pendingFile}
              onClick={() => pendingFile && void persistFile(pendingFile)}
              sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", fontWeight: 700, "&:hover": { bgcolor: "#34d399" } }}
            >
              Retry saving
            </Button>
            <Button fullWidth onClick={() => navigate("/home")} sx={{ minHeight: 48, mt: 1 }}>
              Back to Home
            </Button>
          </Box>
        ) : (
          <Box sx={{ textAlign: "center" }}>
            <CameraAltOutlinedIcon sx={{ color: "#818cf8", fontSize: 48, mb: 2 }} />
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Choose a photo</Typography>
            <Button variant="contained" onClick={() => fileInputRef.current?.click()} sx={{ minHeight: 48, mt: 2 }}>
              Open camera
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
