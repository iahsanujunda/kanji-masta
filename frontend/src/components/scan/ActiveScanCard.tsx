import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, ButtonBase, Paper, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import type { LocalCapture } from "@/lib/captureQueue";
import type { RecentScanItem } from "@/lib/photo";
import { supabase } from "@/lib/supabase";

export type ActiveScanSource =
  | { source: "local"; capture: LocalCapture }
  | { source: "server"; scan: RecentScanItem };

function copyFor(source: ActiveScanSource) {
  if (source.source === "local") {
    if (source.capture.status === "uploading" || source.capture.status === "starting") {
      return { title: "Uploading saved photo", subtitle: "You can safely close the app", Icon: CloudUploadOutlinedIcon };
    }
    if (source.capture.status === "failed") {
      return { title: "Upload needs attention", subtitle: "Open to retry", Icon: ErrorOutlineIcon };
    }
    if (source.capture.status === "needs-auth") {
      return { title: "Sign in to continue", subtitle: "Photo is saved on this device", Icon: ErrorOutlineIcon };
    }
    return { title: "Waiting to upload", subtitle: "Saved on this device", Icon: CloudUploadOutlinedIcon };
  }
  if (source.scan.status === "done") {
    return { title: "Scan ready", subtitle: `${source.scan.kanjiCount ?? "?"} kanji found — review results`, Icon: CheckCircleOutlineIcon };
  }
  if (source.scan.status === "failed") {
    return { title: "Scan needs attention", subtitle: "Analysis did not finish", Icon: ErrorOutlineIcon };
  }
  return { title: "Analysing your photo", subtitle: "You can safely close the app", Icon: AutoAwesomeOutlinedIcon };
}

export default function ActiveScanCard({ item }: { item: ActiveScanSource }) {
  const navigate = useNavigate();
  const [serverImageUrl, setServerImageUrl] = useState<string>();
  const localImageUrl = useMemo(
    () => item.source === "local" && item.capture.blob ? URL.createObjectURL(item.capture.blob) : undefined,
    [item],
  );
  const display = copyFor(item);

  useEffect(() => () => {
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
  }, [localImageUrl]);

  useEffect(() => {
    if (item.source !== "server" || !item.scan.storagePath) return;
    let active = true;
    supabase.storage.from("photos").createSignedUrl(item.scan.storagePath, 300).then(({ data }) => {
      if (active && data?.signedUrl) setServerImageUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [item]);

  const href = item.source === "local" ? `/captures/${item.capture.id}` : `/scans/${item.scan.sessionId}`;
  const imageUrl = localImageUrl ?? serverImageUrl;
  const color = display.Icon === ErrorOutlineIcon ? "error.light" : display.Icon === CheckCircleOutlineIcon ? "#34d399" : "#818cf8";

  return (
    <ButtonBase onClick={() => navigate(href)} sx={{ width: "100%", borderRadius: 4, textAlign: "left" }}>
      <Paper
        variant="outlined"
        sx={{ width: "100%", minHeight: 88, p: 2, display: "flex", alignItems: "center", gap: 2, borderRadius: 4, bgcolor: "#0f0f16", borderColor: "#1a1a24" }}
      >
        {imageUrl ? (
          <Box component="img" src={imageUrl} alt="Scan preview" sx={{ width: 56, height: 56, flexShrink: 0, objectFit: "cover", borderRadius: 2.5 }} />
        ) : (
          <Box sx={{ width: 56, height: 56, flexShrink: 0, display: "grid", placeItems: "center", bgcolor: "#0a0a0f", borderRadius: 2.5 }}>
            <display.Icon sx={{ color, fontSize: 26 }} />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontWeight={700}>{display.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{display.subtitle}</Typography>
        </Box>
        <ChevronRightIcon sx={{ color: "text.disabled", flexShrink: 0 }} />
      </Paper>
    </ButtonBase>
  );
}
