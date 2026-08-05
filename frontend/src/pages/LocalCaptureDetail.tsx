import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import ScanProgressView from "@/components/scan/ScanProgressView";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteLocalCapture,
  getLocalCapture,
  retryLocalCapture,
} from "@/lib/captureQueue";

export default function LocalCaptureDetail() {
  const { clientCaptureId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: capture, isLoading, refetch } = useQuery({
    queryKey: ["local-capture", clientCaptureId],
    queryFn: () => getLocalCapture(clientCaptureId!),
    enabled: Boolean(clientCaptureId),
  });
  const imageUrl = useMemo(
    () => capture?.blob ? URL.createObjectURL(capture.blob) : undefined,
    [capture],
  );

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    if (!capture?.sessionId || capture.status !== "server-owned") return;
    navigate(`/scans/${capture.sessionId}`, { replace: true });
    void deleteLocalCapture(capture.id);
  }, [capture, navigate]);

  const belongsToUser = !capture || !user || capture.userId === user.id;

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Scan" backTo="/home" />
      {isLoading ? (
        <ScanProgressView onBack={() => navigate("/home")} />
      ) : !capture || !belongsToUser ? (
        <Box sx={{ flex: 1, px: 3, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>This capture is unavailable</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>It may have already moved to your recent scans.</Typography>
          <Button onClick={() => navigate("/home")} sx={{ minHeight: 48 }}>Back to Home</Button>
        </Box>
      ) : capture.status === "failed" ? (
        <Box role="alert" sx={{ flex: 1, px: 3, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <ErrorOutlineIcon sx={{ color: "error.light", fontSize: 36, mb: 2 }} />
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Upload needs attention</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>{capture.lastError ?? "The saved photo could not be uploaded."}</Typography>
          <Button
            variant="contained"
            onClick={async () => { await retryLocalCapture(capture.id); await refetch(); }}
            sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", fontWeight: 700 }}
          >
            Retry
          </Button>
          <Button onClick={() => navigate("/home")} sx={{ minHeight: 48, mt: 1 }}>Back to Home</Button>
        </Box>
      ) : (
        <ScanProgressView
          imageUrl={imageUrl}
          supportingText={capture.lastError ?? "We’ll keep working in the background."}
          onBack={() => navigate("/home")}
        />
      )}
    </Box>
  );
}
