import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import LockResetIcon from "@mui/icons-material/LockReset";
import LogoutIcon from "@mui/icons-material/Logout";
import type { User } from "@supabase/supabase-js";

interface Props {
  user: User | null;
  onLogout: () => void;
  children: ReactNode;
}

export default function AppLayout({ user, onLogout, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Box>
      <AppBar position="fixed">
        <Toolbar>
          {user && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <Box sx={{ width: 250 }}>
          <List>
            <ListItemButton
              onClick={() => {
                navigate("/change-password");
                setDrawerOpen(false);
              }}
            >
              <ListItemIcon>
                <LockResetIcon />
              </ListItemIcon>
              <ListItemText primary="Change Password" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                onLogout();
                setDrawerOpen(false);
              }}
            >
              <ListItemIcon>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>

      <Toolbar />
      {children}
    </Box>
  );
}
