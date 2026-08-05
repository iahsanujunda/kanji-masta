import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PageHeader from "@/components/PageHeader";
import ScanProgressView from "@/components/scan/ScanProgressView";
import ScanResultsView from "@/components/scan/ScanResultsView";
import { useScanSession } from "@/hooks/useScanSession";
import { ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";

function failureMessage(code?: string | null): string {
  if (code === "timed_out") return "Analysis took too long and stopped.";
  if (code === "invalid_response") return "The photo could not be read clearly.";
  return "Analysis did not finish.";
}

export default function ScanDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const query = useScanSession(sessionId);
  const [imageUrl, setImageUrl] = useState<string>();

  useEffect(() => {
    const storagePath = query.data?.storagePath;
    if (!storagePath) return;
    let active = true;
    supabase.storage.from("photos").createSignedUrl(storagePath, 300).then(({ data }) => {
      if (active && data?.signedUrl) setImageUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [query.data?.storagePath]);

  if (query.data?.status === "done" && query.data.kanji) {
    return <ScanResultsView sessionId={query.data.sessionId} kanji={query.data.kanji} />;
  }

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Scan" backTo="/home" />
      {query.isLoading || query.data?.status === "processing" ? (
        <ScanProgressView imageUrl={imageUrl} onBack={() => navigate("/home")} />
      ) : query.data?.status === "failed" ? (
        <Box role="alert" sx={{ flex: 1, px: 3, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <ErrorOutlineIcon sx={{ color: "error.light", fontSize: 36, mb: 2 }} />
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Scan needs attention</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>{failureMessage(query.data.failureCode)}</Typography>
          <Button variant="contained" onClick={() => navigate("/capture")} sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", fontWeight: 700 }}>
            Capture another photo
          </Button>
          <Button onClick={() => navigate("/home")} sx={{ minHeight: 48, mt: 1 }}>Back to Home</Button>
        </Box>
      ) : query.data?.status === "ingested" ? (
        <Box sx={{ flex: 1, px: 3, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <CheckCircleOutlineIcon sx={{ color: "#34d399", fontSize: 36, mb: 2 }} />
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Added to your collection</Typography>
          <Button variant="contained" onClick={() => navigate("/collection")} sx={{ minHeight: 48, mt: 2 }}>View collection</Button>
        </Box>
      ) : (
        <Box role="alert" sx={{ flex: 1, px: 3, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
            {query.error instanceof ApiError && query.error.status === 404 ? "This scan is unavailable" : "Couldn’t refresh this scan"}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Check your connection and try again.</Typography>
          <Button variant="contained" onClick={() => void query.refetch()} sx={{ minHeight: 48 }}>Retry</Button>
          <Button onClick={() => navigate("/home")} sx={{ minHeight: 48, mt: 1 }}>Back to Home</Button>
        </Box>
      )}
    </Box>
  );
}
