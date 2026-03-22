import { Box, List, ListItemButton, ListItemIcon, ListItemText, Paper } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import PageHeader from "@/components/PageHeader";

export default function Settings() {
  const handleLogout = async () => {
    await signOut(auth);
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
      <PageHeader title="Settings" backTo="/" />

      <Box sx={{ px: 3 }}>
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