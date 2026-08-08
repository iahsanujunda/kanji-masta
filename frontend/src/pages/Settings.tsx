import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import MenuBookIcon from "@mui/icons-material/MenuBook";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { deleteLocalCapturesForUser, listLocalCaptures } from "@/lib/captureQueue";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";

interface Settings {
  quizAllowancePerSlot: number;
  slotDurationHours: number;
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const settingsKey = queryKeys.settings(user?.id ?? "");
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: () => apiFetch<Settings>("/api/settings"),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
  const [draft, setDraft] = useState<Settings | null>(null);
  const settings = draft ?? settingsQuery.data ?? { quizAllowancePerSlot: 5, slotDurationHours: 6 };
  const saveSettings = useMutation({
    mutationFn: (updated: Settings) => apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify(updated),
    }),
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<Settings>(settingsKey);
      queryClient.setQueryData(settingsKey, updated);
      return previous;
    },
    onError: (_error, _updated, previous) => {
      if (previous) queryClient.setQueryData(settingsKey, previous);
      setDraft(null);
    },
    onSuccess: (_data, updated) => {
      queryClient.setQueryData(settingsKey, updated);
      setDraft(null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKey }),
  });

  const handleSave = (updated: Partial<Settings>) => {
    const merged = { ...settings, ...updated };
    setDraft(merged);
    saveSettings.mutate(merged);
  };

  const handleLogout = async () => {
    const userId = user?.id;
    if (userId) {
      const captures = await listLocalCaptures(userId);
      const savedPhotos = captures.filter((capture) => capture.blob).length;
      if (savedPhotos > 0) {
        const confirmed = window.confirm(
          `Logging out will remove ${savedPhotos} saved ${savedPhotos === 1 ? "photo" : "photos"} that have not reached the server. Continue?`,
        );
        if (!confirmed) return;
      }
      await deleteLocalCapturesForUser(userId);
    }
    await signOut();
  };

  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
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
              onChange={(_, v) => setDraft({ ...settings, quizAllowancePerSlot: v as number })}
              onChangeCommitted={(_, v) => handleSave({ quizAllowancePerSlot: v as number })}
              min={3}
              max={15}
              step={1}
              marks={[{ value: 3, label: "3" }, { value: 5, label: "5" }, { value: 10, label: "10" }, { value: 15, label: "15" }]}
              disabled={!settingsQuery.data}
              sx={{ color: "secondary.main" }}
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
              disabled={!settingsQuery.data}
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
              <ListItemButton onClick={() => navigate("/onboarding")}>
                <ListItemIcon>
                  <MenuBookIcon />
                </ListItemIcon>
                <ListItemText primary="Re-seed known kanji" secondary="Add more kanji you already know" />
              </ListItemButton>
            </ListItem>
            <Divider />
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
