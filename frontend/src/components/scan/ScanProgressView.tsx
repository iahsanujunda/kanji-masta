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
          sx={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 4, mb: 4, border: "1px solid", borderColor: "app.border.default" }}
        />
      ) : (
        <Box sx={{ width: 56, height: 56, borderRadius: 3, bgcolor: "app.tone.secondary.soft", display: "grid", placeItems: "center", mb: 4 }}>
          <AutoAwesomeOutlinedIcon sx={{ color: "secondary.light", fontSize: 28 }} />
        </Box>
      )}
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>Analysing</Typography>
      <Typography sx={{ color: "app.accent.secondaryPale", mb: 3 }}>You can close the app</Typography>
      <LinearProgress
        aria-label="Analysing photo"
        sx={{ height: 4, borderRadius: 2, mb: 2.5, bgcolor: "background.elevated", "& .MuiLinearProgress-bar": { bgcolor: "secondary.light" } }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>{supportingText}</Typography>
      <Button variant="outlined" onClick={onBack} sx={{ minHeight: 48, borderColor: "background.elevated" }}>
        Back to Home
      </Button>
    </Box>
  );
}
