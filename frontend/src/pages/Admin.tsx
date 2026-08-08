import { useState } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import SpaIcon from "@mui/icons-material/Spa";
import { useQuery } from "@tanstack/react-query";
import CostTab from "@/pages/admin/CostTab";
import JobsTab from "@/pages/admin/JobsTab";
import InvitesTab from "@/pages/admin/InvitesTab";
import { useAuth } from "@/hooks/useAuth";
import { adminApi } from "@/pages/admin/api";

type Tab = "cost" | "jobs" | "invites";
const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "cost", label: "Cost", icon: <AttachMoneyIcon /> },
  { id: "jobs", label: "Jobs", icon: <WorkOutlineIcon /> },
  { id: "invites", label: "Invites", icon: <PeopleOutlineIcon /> },
];

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("jobs");
  const status = useQuery({
    queryKey: ["admin-status", user?.id],
    queryFn: ({ signal }) => adminApi.status(signal),
    enabled: Boolean(user),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const operational = status.data?.status === "operational";

  return <Box sx={{ minHeight: "var(--app-height)", bgcolor: "background.default", color: "grey.100" }}>
    <Box sx={{ width: "100%", maxWidth: 480, minHeight: "var(--app-height)", mx: "auto", bgcolor: "background.default", borderInline: { sm: "1px solid" }, borderColor: "app.surface.muted", pb: "calc(84px + env(safe-area-inset-bottom))" }}>
      <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 20, bgcolor: (theme) => alpha(theme.palette.background.default, 0.92), backdropFilter: "blur(16px)", borderBottom: "1px solid", borderColor: "app.border.default", px: 2, py: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 34, height: 34, borderRadius: 1.5, background: (theme) => theme.palette.app.gradient.brand, display: "grid", placeItems: "center" }}><SpaIcon sx={{ color: "white", fontSize: 20 }} /></Box>
            <Box><Typography sx={{ color: "white", fontSize: 16, fontWeight: 900 }}>Shuukan Admin</Typography><Typography sx={{ color: "grey.600", fontSize: 10 }}>Control plane</Typography></Box>
          </Box>
          <Chip label={status.isLoading ? "Checking" : operational ? "Operational" : "System down"} size="small" sx={{ bgcolor: operational ? "app.tone.primary.subtle" : "app.tone.error.subtle", color: operational ? "primary.light" : "error.light", border: "1px solid", borderColor: operational ? "app.tone.primary.strongBorder" : "app.tone.error.strongBorder", fontWeight: 800, fontSize: 10 }} />
        </Box>
      </Box>
      <Box component="main" sx={{ px: 2, py: 2 }}>
        <Typography component="h1" sx={{ fontSize: 24, fontWeight: 950, color: "white", mb: 2 }}>{tabs.find((item) => item.id === tab)?.label}</Typography>
        {tab === "cost" && <CostTab />}
        {tab === "jobs" && <JobsTab />}
        {tab === "invites" && <InvitesTab />}
      </Box>
      <Box component="nav" aria-label="Admin sections" sx={{ position: "fixed", zIndex: 25, bottom: 0, left: "50%", transform: "translateX(-50%)", width: "min(100vw, 480px)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", bgcolor: (theme) => alpha(theme.palette.background.sunken, 0.96), backdropFilter: "blur(16px)", borderTop: "1px solid", borderColor: "background.hover", pb: "env(safe-area-inset-bottom)" }}>
        {tabs.map((item) => <Button key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)} sx={{ minHeight: 68, display: "flex", flexDirection: "column", gap: .25, borderRadius: 0, color: tab === item.id ? "primary.light" : "grey.600", textTransform: "none", fontSize: 11, fontWeight: 800, "& svg": { fontSize: 21 } }}>{item.icon}{item.label}</Button>)}
      </Box>
    </Box>
  </Box>;
}
