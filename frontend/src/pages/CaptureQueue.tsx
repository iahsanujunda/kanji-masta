import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useLocalCaptures } from "@/hooks/useCaptureQueue";
import {
  deleteLocalCapture,
  getCaptureStorageSummary,
  retryLocalCapture,
  type LocalCapture,
} from "@/lib/captureQueue";
import { timeAgo } from "@/lib/format";

export default function CaptureQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: captures = [], isLoading } = useLocalCaptures(user?.id);
  const { data: storage } = useQuery({
    queryKey: ["capture-storage", user?.id],
    queryFn: () => getCaptureStorageSummary(user!.id),
    enabled: Boolean(user),
  });
  const [deleteTarget, setDeleteTarget] = useState<LocalCapture>();
  const savedCaptures = captures.filter((capture) => capture.blob && capture.status !== "server-owned");

  const removeCapture = async () => {
    if (!deleteTarget) return;
    await deleteLocalCapture(deleteTarget.id);
    setDeleteTarget(undefined);
    await queryClient.invalidateQueries({ queryKey: ["local-captures", user?.id] });
  };

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto" }}>
      <PageHeader title="Saved photos" backTo="/home" />
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 6 }}>
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2.5, borderRadius: 3, bgcolor: "#0f0f16", borderColor: "#1a1a24" }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <CloudDoneOutlinedIcon sx={{ color: storage?.persistence === "granted" ? "#34d399" : "#818cf8" }} />
            <Box>
              <Typography fontWeight={700}>
                {savedCaptures.length} {savedCaptures.length === 1 ? "photo" : "photos"} saved
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatBytes(storage?.totalBytes ?? 0)} on this device
                {storage?.persistence === "granted" ? " · Storage protected" : ""}
              </Typography>
            </Box>
          </Box>
          {storage?.hasAgedCapture && (
            <Typography variant="body2" sx={{ color: "#a5b4fc", mt: 1.5 }}>
              An older photo still needs attention. It will not be removed automatically.
            </Typography>
          )}
        </Paper>

        {isLoading ? (
          <Typography color="text.secondary">Loading saved photos…</Typography>
        ) : savedCaptures.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography variant="h6" fontWeight={700}>No photos waiting</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
              New scans will appear here until upload finishes.
            </Typography>
            <Button variant="contained" onClick={() => navigate("/capture")} sx={primaryButtonSx}>
              Capture a photo
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {savedCaptures.map((capture) => (
              <QueueCaptureCard key={capture.id} capture={capture} onDelete={() => setDeleteTarget(capture)} />
            ))}
          </Box>
        )}
      </Box>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)}>
        <DialogTitle>Remove saved photo?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            This photo has not reached the server. Removing it cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(undefined)} sx={{ minHeight: 44 }}>Keep photo</Button>
          <Button color="error" onClick={() => void removeCapture()} sx={{ minHeight: 44 }}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function QueueCaptureCard({ capture, onDelete }: { capture: LocalCapture; onDelete: () => void }) {
  const navigate = useNavigate();
  const imageUrl = useMemo(() => capture.blob ? URL.createObjectURL(capture.blob) : undefined, [capture.blob]);
  const copy = statusCopy(capture);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, borderRadius: 3, bgcolor: "#0f0f16", borderColor: "#1a1a24", display: "flex", gap: 1.5, alignItems: "center" }}
    >
      <Box
        component="img"
        src={imageUrl}
        alt="Saved scan preview"
        sx={{ width: 64, height: 64, objectFit: "cover", borderRadius: 2.5, bgcolor: "#0a0a0f", flexShrink: 0 }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography fontWeight={700}>{copy.title}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{copy.subtitle}</Typography>
        <Typography variant="caption" color="text.disabled">{timeAgo(capture.createdAt)}</Typography>
        {(capture.status === "failed" || capture.status === "needs-auth") && (
          <Button
            size="small"
            onClick={() => void retryLocalCapture(capture.id)}
            sx={{ display: "block", minHeight: 36, mt: 0.5, px: 0, color: "#34d399" }}
          >
            Retry upload
          </Button>
        )}
      </Box>
      <IconButton aria-label="Remove saved photo" onClick={onDelete} sx={{ width: 44, height: 44, color: "text.secondary" }}>
        <DeleteOutlineIcon />
      </IconButton>
      <IconButton aria-label="Open saved photo" onClick={() => navigate(`/captures/${capture.id}`)} sx={{ width: 44, height: 44 }}>
        <ChevronRightIcon />
      </IconButton>
    </Paper>
  );
}

function statusCopy(capture: LocalCapture) {
  if (capture.status === "uploading" || capture.status === "starting") {
    return { title: "Uploading", subtitle: "Safe to close" };
  }
  if (capture.status === "needs-auth") {
    return { title: "Needs sign-in", subtitle: "Saved on this device" };
  }
  if (capture.status === "failed") {
    return { title: "Needs attention", subtitle: capture.lastError ?? "Upload did not finish" };
  }
  return { title: "Waiting", subtitle: "Saved on this device" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const primaryButtonSx = {
  minHeight: 48,
  bgcolor: "#10b981",
  color: "#050508",
  fontWeight: 700,
  "&:hover": { bgcolor: "#34d399" },
};
