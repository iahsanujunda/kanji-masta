import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Typography,
} from "@mui/material";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import SettingsIcon from "@mui/icons-material/Settings";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

export default function Home() {
  const navigate = useNavigate();
  const [slotState] = useState<"active" | "completed">("active");

  // Mocked data — will be replaced with real API calls
  const userStats = { streak: 12, learning: 24, familiar: 108 };
  const currentSlot = {
    name: "Evening Slot",
    remaining: slotState === "active" ? 5 : 0,
    total: 5,
    endTime: "23:59",
    nextSlotTime: "06:00",
  };

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
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 3,
          pt: 5,
          pb: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight="bold">
            Kanji Masta
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Yokohama, JP
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Chip
            icon={<WhatshotIcon sx={{ fontSize: 18 }} />}
            label={userStats.streak}
            size="small"
            sx={{
              bgcolor: "rgba(255, 152, 0, 0.15)",
              color: "warning.main",
              fontWeight: "bold",
            }}
          />
          <IconButton
            color="inherit"
            onClick={() => navigate("/settings")}
            sx={{ color: "text.secondary" }}
          >
            <SettingsIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Main content */}
      <Box sx={{ flex: 1, px: 3, pb: 16, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {/* Quiz slot card */}
        {slotState === "active" ? (
          <Paper
            elevation={4}
            sx={{
              bgcolor: "#4338ca",
              color: "white",
              borderRadius: 4,
              p: 3,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 3,
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.8, mb: 0.5 }}>
                  {currentSlot.name} Available
                </Typography>
                <Typography variant="h3" fontWeight="bold" component="div">
                  {currentSlot.remaining}{" "}
                  <Typography
                    component="span"
                    variant="h6"
                    sx={{ opacity: 0.7, fontWeight: "normal" }}
                  >
                    quizzes
                  </Typography>
                </Typography>
              </Box>
              <Chip
                label={`Ends ${currentSlot.endTime}`}
                size="small"
                sx={{
                  bgcolor: "rgba(30, 27, 75, 0.5)",
                  color: "inherit",
                  fontSize: "0.75rem",
                }}
              />
            </Box>
            <Button
              fullWidth
              size="large"
              variant="contained"
              endIcon={<ChevronRightIcon />}
              sx={{
                bgcolor: "white",
                color: "#4338ca",
                fontWeight: "bold",
                fontSize: "1.1rem",
                py: 1.5,
                borderRadius: 3,
                "&:hover": { bgcolor: "grey.100" },
              }}
            >
              Start Session
            </Button>
          </Paper>
        ) : (
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 4,
              p: 3,
              borderColor: "success.dark",
              bgcolor: "rgba(46, 125, 50, 0.08)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
              <CheckCircleIcon color="success" />
              <Typography fontWeight="bold" color="success.main">
                Slot Complete
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Great job. You're completely caught up for now.
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: 1.5,
                borderRadius: 2,
              }}
            >
              <Typography variant="body2">Next slot opens at</Typography>
              <Chip label={currentSlot.nextSlotTime} size="small" />
            </Paper>
          </Paper>
        )}

        {/* Kanji stats card */}
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 4,
            p: 2.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Box
              sx={{
                bgcolor: "action.selected",
                p: 1.5,
                borderRadius: 3,
                display: "flex",
              }}
            >
              <MenuBookIcon />
            </Box>
            <Box>
              <Typography fontWeight="bold">Your Kanji</Typography>
              <Box sx={{ display: "flex", gap: 1.5, mt: 0.25 }}>
                <Typography variant="body2" color="primary.main" fontWeight="medium">
                  {userStats.learning} learning
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  •
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {userStats.familiar} familiar
                </Typography>
              </Box>
            </Box>
          </Box>
          <ChevronRightIcon sx={{ color: "text.disabled" }} />
        </Paper>
      </Box>

      {/* Bottom capture button */}
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
          variant="contained"
          size="large"
          startIcon={
            <Box
              sx={{
                bgcolor: "rgba(0,0,0,0.1)",
                p: 1,
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <CameraAltIcon sx={{ fontSize: 28 }} />
            </Box>
          }
          sx={{
            pointerEvents: "auto",
            maxWidth: 480 - 48,
            width: "100%",
            mx: 3,
            py: 2,
            borderRadius: 8,
            fontSize: "1.2rem",
            fontWeight: "bold",
            letterSpacing: 1,
            bgcolor: "grey.100",
            color: "grey.900",
            "&:hover": { bgcolor: "grey.300" },
          }}
        >
          Capture Kanji
        </Button>
      </Box>
    </Box>
  );
}
