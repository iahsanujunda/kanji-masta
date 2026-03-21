import { useNavigate } from "react-router-dom";
import { Box, Button, List, ListItemButton, ListItemIcon, ListItemText, Paper, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LogoutIcon from "@mui/icons-material/Logout";
import { supabase } from "../lib/supabase";

export default function Settings() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          pt: 5,
          pb: 2,
        }}
      >
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/")}
          color="inherit"
        >
          Back
        </Button>
      </Box>

      <Box sx={{ px: 3 }}>
        <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
          Settings
        </Typography>

        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <List disablePadding>
            <ListItemButton onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon color="error" />
              </ListItemIcon>
              <ListItemText
                primary="Logout"
                primaryTypographyProps={{ color: "error" }}
              />
            </ListItemButton>
          </List>
        </Paper>
      </Box>
    </Box>
  );
}
