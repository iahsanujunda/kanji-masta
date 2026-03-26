import { useEffect, useState } from "react";
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

interface Settings {
  quizAllowancePerSlot: number;
  slotDurationHours: number;
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({ quizAllowancePerSlot: 5, slotDurationHours: 6 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch<Settings>("/api/settings")
      .then((data) => { setSettings(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const handleSave = async (updated: Partial<Settings>) => {
    const merged = { ...settings, ...updated };
    setSettings(merged);
    await apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify(merged),
    }).catch(() => {});
  };

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
      <PageHeader title="Settings" backTo="/home" />

      <Box sx={{ px: 3, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Quiz Settings */}
        <Paper variant="outlined" sx={{ borderRadius: 3, p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: "uppercase", letterSpacing: 1 }}>
            Quiz Session
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
              Quizzes per session: {settings.quizAllowancePerSlot}
            </Typography>
            <Slider
              value={settings.quizAllowancePerSlot}
              onChange={(_, v) => setSettings({ ...settings, quizAllowancePerSlot: v as number })}
              onChangeCommitted={(_, v) => handleSave({ quizAllowancePerSlot: v as number })}
              min={3}
              max={15}
              step={1}
              marks={[{ value: 3, label: "3" }, { value: 5, label: "5" }, { value: 10, label: "10" }, { value: 15, label: "15" }]}
              disabled={!loaded}
              sx={{ color: "#4338ca" }}
            />
            <Typography variant="caption" color="text.secondary">
              Changes take effect from your next session.
            </Typography>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box>
            <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
              Session window
            </Typography>
            <Select
              value={settings.slotDurationHours}
              onChange={(e) => handleSave({ slotDurationHours: e.target.value as number })}
              fullWidth
              size="small"
              disabled={!loaded}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value={3}>3 hours</MenuItem>
              <MenuItem value={6}>6 hours</MenuItem>
              <MenuItem value={8}>8 hours</MenuItem>
              <MenuItem value={12}>12 hours</MenuItem>
            </Select>
          </Box>
        </Paper>

        {/* Account */}
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <List disablePadding>
            <ListItem disablePadding>
              <ListItemButton onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon color="error" />
                </ListItemIcon>
                <ListItemText primary="Logout" primaryTypographyProps={{ color: "error" }} />
              </ListItemButton>
            </ListItem>
          </List>
        </Paper>
      </Box>
    </Box>
  );
}
