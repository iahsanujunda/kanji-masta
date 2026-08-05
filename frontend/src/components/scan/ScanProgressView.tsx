import { Box, Button, LinearProgress, Typography } from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

interface ScanProgressViewProps {
  imageUrl?: string;
  supportingText?: string;
  onBack: () => void;
}

export default function ScanProgressView({
  imageUrl,
  supportingText = "We’ll keep working in the background.",
  onBack,
}: ScanProgressViewProps) {
  return (
    <Box sx={{ flex: 1, px: 3, pb: 6, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt="Photo being analysed"
          sx={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 4, mb: 4, border: "1px solid #1a1a24" }}
        />
      ) : (
        <Box sx={{ width: 56, height: 56, borderRadius: 3, bgcolor: "rgba(67,56,202,0.16)", display: "grid", placeItems: "center", mb: 4 }}>
          <AutoAwesomeOutlinedIcon sx={{ color: "#818cf8", fontSize: 28 }} />
        </Box>
      )}
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>Analysing</Typography>
      <Typography sx={{ color: "#a5b4fc", mb: 3 }}>You can close the app</Typography>
      <LinearProgress
        aria-label="Analysing photo"
        sx={{ height: 4, borderRadius: 2, mb: 2.5, bgcolor: "#1a1a24", "& .MuiLinearProgress-bar": { bgcolor: "#818cf8" } }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>{supportingText}</Typography>
      <Button variant="outlined" onClick={onBack} sx={{ minHeight: 48, borderColor: "#1a1a24" }}>
        Back to Home
      </Button>
    </Box>
  );
}
