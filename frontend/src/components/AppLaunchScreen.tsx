import { Box, CircularProgress, Typography } from "@mui/material";
import SpaIcon from "@mui/icons-material/Spa";

export default function AppLaunchScreen() {
  return (
    <Box sx={{ minHeight: "var(--app-height)", display: "grid", placeItems: "center", bgcolor: "background.default", px: 3 }}>
      <Box sx={{ display: "grid", justifyItems: "center", gap: 1.5 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2.5, background: (theme) => theme.palette.app.gradient.brand, display: "grid", placeItems: "center" }}>
          <SpaIcon sx={{ color: "white", fontSize: 28 }} />
        </Box>
        <Typography sx={{ color: "grey.300", fontWeight: 700 }}>Opening Shuukan…</Typography>
        <CircularProgress size={22} sx={{ color: "primary.main" }} />
      </Box>
    </Box>
  );
}
