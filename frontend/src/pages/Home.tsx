import { Box, Button } from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import { apiFetch } from "../lib/api";

export default function Home() {
  const handleClick = async () => {
    const res = await apiFetch<{ message: string }>("/api/click", {
      method: "POST",
      body: JSON.stringify({ clickedAt: new Date().toISOString() }),
    });
    alert(res.message);
  };

  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Button
        variant="contained"
        size="large"
        startIcon={<CameraAltIcon />}
        onClick={handleClick}
        sx={{ fontSize: "2rem", px: 6, py: 3, borderRadius: 4 }}
      >
        SCAN
      </Button>
    </Box>
  );
}