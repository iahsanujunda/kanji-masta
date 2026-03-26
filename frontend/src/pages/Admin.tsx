import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import WorkIcon from "@mui/icons-material/Work";
import PeopleIcon from "@mui/icons-material/People";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import SpaIcon from "@mui/icons-material/Spa";
import { apiFetch } from "@/lib/api";

// --- Types ---

interface CostByUser {
  userId: string;
  photoMicrodollars: number;
  quizGenMicrodollars: number;
  totalMicrodollars: number;
}

interface CostByDay {
  date: string;
  totalMicrodollars: number;
}

interface CostData {
  totalMicrodollars: number;
  totalDollars: string;
  byUser: CostByUser[];
  byDay: CostByDay[];
}

interface JobItem {
  id: string;
  status: string;
  attempts: number;
  kanji: string;
  word: string | null;
  userId: string;
  costMicrodollars: number | null;
  createdAt: string;
}

interface JobCounts {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

interface JobsData {
  jobs: JobItem[];
  counts: JobCounts;
}

interface InviteItem {
  id: string;
  email: string;
  code: string;
  status: string;
  invitedBy: string;
  createdAt: string;
  acceptedAt: string | null;
}

interface InviteListData {
  invites: InviteItem[];
}

// --- Helpers ---

const usd = (microdollars: number) => `$${(microdollars / 1_000_000).toFixed(2)}`;

const card = {
  bgcolor: "#0f0f16",
  border: "1px solid",
  borderColor: "grey.800",
  borderRadius: 4,
  p: 3,
};

// --- Cost Tab ---

function CostTab() {
  const [data, setData] = useState<CostData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<CostData>("/api/admin/cost").then(setData).catch(() => setError("Failed to load cost data"));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Typography color="grey.500">Loading...</Typography>;

  const maxDay = Math.max(...data.byDay.map((d) => d.totalMicrodollars), 1);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Total */}
      <Box sx={card}>
        <Typography sx={{ color: "grey.500", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, mb: 1 }}>Total Spend</Typography>
        <Typography sx={{ fontSize: 40, fontWeight: 900, color: "white" }}>${data.totalDollars}</Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 3 }}>
        {/* By User */}
        <Box sx={card}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white", mb: 3 }}>By User</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {data.byUser.map((u) => (
              <Box key={u.userId} sx={{ bgcolor: "rgba(0,0,0,0.3)", border: "1px solid", borderColor: "grey.800", borderRadius: 2, p: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography sx={{ fontWeight: 700, color: "grey.200", fontSize: 14 }}>{u.userId.slice(0, 8)}...</Typography>
                  <Typography sx={{ fontFamily: "monospace", color: "#34d399", fontWeight: 600 }}>{usd(u.totalMicrodollars)}</Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Chip label={`photo: ${usd(u.photoMicrodollars)}`} size="small" sx={{ bgcolor: "grey.800", color: "grey.400", fontSize: 11 }} />
                  <Chip label={`quizgen: ${usd(u.quizGenMicrodollars)}`} size="small" sx={{ bgcolor: "grey.800", color: "grey.400", fontSize: 11 }} />
                </Box>
              </Box>
            ))}
            {data.byUser.length === 0 && <Typography color="grey.600" fontSize={13}>No cost data yet</Typography>}
          </Box>
        </Box>

        {/* Daily Chart */}
        <Box sx={{ ...card, display: "flex", flexDirection: "column" }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white", mb: 3 }}>Daily Spend (Last 14 Days)</Typography>
          <Box sx={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 0.75, minHeight: 200, position: "relative" }}>
            {data.byDay.map((d) => {
              const pct = (d.totalMicrodollars / maxDay) * 100;
              return (
                <Box key={d.date} sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }} title={`${d.date}: ${usd(d.totalMicrodollars)}`}>
                  <Box sx={{ width: "100%", bgcolor: "#6366f1", borderRadius: "2px 2px 0 0", height: `${pct}%`, minHeight: 4, "&:hover": { bgcolor: "#818cf8" }, transition: "background-color 0.2s" }} />
                </Box>
              );
            })}
          </Box>
          {data.byDay.length === 0 && <Typography color="grey.600" fontSize={13} textAlign="center">No data yet</Typography>}
        </Box>
      </Box>
    </Box>
  );
}

// --- Jobs Tab ---

function JobsTab() {
  const [data, setData] = useState<JobsData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiFetch<JobsData>("/api/admin/jobs").then(setData).catch(() => setError("Failed to load jobs"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (id: string) => {
    await apiFetch(`/api/admin/jobs/${id}/retry`, { method: "POST" });
    load();
  };

  const handleRetryAll = async () => {
    await apiFetch("/api/admin/jobs/retry-all", { method: "POST" });
    load();
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Typography color="grey.500">Loading...</Typography>;

  const failedJobs = data.jobs.filter((j) => j.status === "FAILED");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Status counts */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
        <Box sx={{ ...card, borderColor: "grey.800" }}>
          <Typography sx={{ color: "grey.500", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, mb: 0.5 }}>Pending</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 900, color: "#818cf8" }}>{data.counts.pending}</Typography>
        </Box>
        <Box sx={{ ...card, borderColor: "rgba(239,68,68,0.3)", bgcolor: "rgba(239,68,68,0.03)" }}>
          <Typography sx={{ color: "grey.500", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, mb: 0.5 }}>Failed</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 900, color: "#f87171" }}>{data.counts.failed}</Typography>
        </Box>
        <Box sx={{ ...card, borderColor: "rgba(16,185,129,0.3)", bgcolor: "rgba(16,185,129,0.03)" }}>
          <Typography sx={{ color: "grey.500", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, mb: 0.5 }}>Done</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 900, color: "#34d399" }}>{data.counts.done}</Typography>
        </Box>
      </Box>

      {/* Failed jobs table */}
      <Box sx={card}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>Failed Jobs</Typography>
          {failedJobs.length > 0 && (
            <Button startIcon={<RefreshIcon />} onClick={handleRetryAll} size="small" sx={{ bgcolor: "grey.800", color: "white", textTransform: "none", fontWeight: 700, fontSize: 12, "&:hover": { bgcolor: "grey.700" } }}>
              Retry All Failed
            </Button>
          )}
        </Box>
        {failedJobs.length === 0 ? (
          <Typography color="grey.600" fontSize={13}>No failed jobs</Typography>
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
            <Box component="thead">
              <Box component="tr" sx={{ borderBottom: "1px solid", borderColor: "grey.800" }}>
                <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "left", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Target</Box>
                <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "left", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>User</Box>
                <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "left", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Attempts</Box>
                <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "right", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Actions</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {failedJobs.map((job) => (
                <Box component="tr" key={job.id} sx={{ borderBottom: "1px solid rgba(75,85,99,0.3)", "&:hover": { bgcolor: "rgba(0,0,0,0.2)" } }}>
                  <Box component="td" sx={{ py: 2, px: 2, color: "grey.200", fontWeight: 500, fontSize: 13 }}>{job.kanji}{job.word ? ` / ${job.word}` : ""}</Box>
                  <Box component="td" sx={{ py: 2, px: 2, color: "grey.500", fontSize: 12 }}>{job.userId.slice(0, 8)}...</Box>
                  <Box component="td" sx={{ py: 2, px: 2, color: "#f87171", fontSize: 12, fontWeight: 500 }}>{job.attempts} attempts</Box>
                  <Box component="td" sx={{ py: 2, px: 2, textAlign: "right" }}>
                    <Button size="small" onClick={() => handleRetry(job.id)} sx={{ bgcolor: "rgba(99,102,241,0.2)", color: "#818cf8", textTransform: "none", fontWeight: 700, fontSize: 11, "&:hover": { bgcolor: "rgba(99,102,241,0.4)" } }}>
                      Retry
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// --- Invites Tab ---

function InvitesTab() {
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    apiFetch<InviteListData>("/api/admin/invites").then((d) => setInvites(d.invites)).catch(() => setError("Failed to load invites"));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newEmail.trim()) return;
    setSending(true);
    try {
      await apiFetch("/api/admin/invite", { method: "POST", body: JSON.stringify({ email: newEmail.trim() }) });
      setNewEmail("");
      setDialogOpen(false);
      load();
    } catch {
      setError("Failed to create invite");
    }
    setSending(false);
  };

  const handleRevoke = async (id: string) => {
    await apiFetch(`/api/admin/invite/${id}/revoke`, { method: "PUT" });
    load();
  };

  const statusColor = (status: string) => {
    if (status === "ACCEPTED") return { color: "#34d399", borderColor: "rgba(16,185,129,0.3)", bgcolor: "rgba(16,185,129,0.1)" };
    if (status === "PENDING") return { color: "#818cf8", borderColor: "rgba(99,102,241,0.3)", bgcolor: "rgba(99,102,241,0.1)" };
    return { color: "#f87171", borderColor: "rgba(239,68,68,0.3)", bgcolor: "rgba(239,68,68,0.1)" };
  };

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={card}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>Active Network</Typography>
            <Typography sx={{ fontSize: 12, color: "grey.500" }}>Manage existing users and direct invites.</Typography>
          </Box>
          <Button onClick={() => setDialogOpen(true)} sx={{ bgcolor: "#4338ca", color: "white", textTransform: "none", fontWeight: 700, fontSize: 12, "&:hover": { bgcolor: "#3730a3" } }}>
            + Send Direct Invite
          </Button>
        </Box>

        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: "1px solid", borderColor: "grey.800" }}>
              <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "left", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Email</Box>
              <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "left", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Status</Box>
              <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "left", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Date</Box>
              <Box component="th" sx={{ py: 1.5, px: 2, textAlign: "right", color: "grey.600", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Actions</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {invites.map((inv) => (
              <Box component="tr" key={inv.id} sx={{ borderBottom: "1px solid rgba(75,85,99,0.3)", "&:hover": { bgcolor: "rgba(0,0,0,0.2)" } }}>
                <Box component="td" sx={{ py: 2, px: 2, color: "grey.200", fontWeight: 500, fontSize: 13 }}>{inv.email}</Box>
                <Box component="td" sx={{ py: 2, px: 2 }}>
                  <Chip label={inv.status} size="small" sx={{ ...statusColor(inv.status), fontWeight: 700, fontSize: 10, border: "1px solid" }} />
                </Box>
                <Box component="td" sx={{ py: 2, px: 2, color: "grey.500", fontSize: 12 }}>{inv.createdAt.slice(0, 10)}</Box>
                <Box component="td" sx={{ py: 2, px: 2, textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
                  {inv.status === "PENDING" && (
                    <>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon sx={{ fontSize: 12 }} />}
                        onClick={() => {
                          const link = `${window.location.origin}/signup?invite=${inv.code}`;
                          navigator.clipboard.writeText(link);
                        }}
                        sx={{ color: "#34d399", textTransform: "none", fontWeight: 700, fontSize: 11, border: "1px solid rgba(16,185,129,0.3)", "&:hover": { bgcolor: "rgba(16,185,129,0.1)" } }}
                      >
                        Copy Link
                      </Button>
                      <Button size="small" onClick={() => handleRevoke(inv.id)} sx={{ color: "#f87171", textTransform: "none", fontWeight: 700, fontSize: 11, border: "1px solid rgba(239,68,68,0.3)", "&:hover": { bgcolor: "rgba(239,68,68,0.1)" } }}>
                        Revoke
                      </Button>
                    </>
                  )}
                  {inv.status !== "PENDING" && <Typography color="grey.700">—</Typography>}
                </Box>
              </Box>
            ))}
            {invites.length === 0 && (
              <Box component="tr">
                <Box component="td" colSpan={4} sx={{ py: 4, textAlign: "center", color: "grey.600", fontSize: 13 }}>No invites yet</Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Create invite dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} PaperProps={{ sx: { bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Send Direct Invite</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Email address"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            sx={{ mt: 1 }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ color: "grey.500", textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={sending || !newEmail.trim()} sx={{ bgcolor: "#4338ca", color: "white", textTransform: "none", fontWeight: 700, "&:hover": { bgcolor: "#3730a3" } }}>
            {sending ? "Sending..." : "Send Invite"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// --- Main Admin Page ---

export default function Admin() {
  const [tab, setTab] = useState(0);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/cost").catch((err: Error) => {
      if (err.message.includes("403")) setAccessDenied(true);
    });
  }, []);

  if (accessDenied) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#050508", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography sx={{ color: "grey.500", fontSize: 16 }}>Access denied. Admin only.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#050508", color: "grey.100" }}>
      {/* Navbar */}
      <Box component="nav" sx={{ borderBottom: "1px solid", borderColor: "grey.800", bgcolor: "#0a0a0f", position: "sticky", top: 0, zIndex: 30 }}>
        <Box sx={{ maxWidth: 1152, mx: "auto", px: 3, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: "grey.800", border: "1px solid", borderColor: "grey.700", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SpaIcon sx={{ fontSize: 20, color: "#34d399" }} />
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>
              Shuukan <Typography component="span" sx={{ color: "grey.500", fontWeight: 400 }}>Admin</Typography>
            </Typography>
          </Box>
          <Chip label="System Operational" size="small" sx={{ bgcolor: "grey.900", color: "grey.500", border: "1px solid", borderColor: "grey.800", fontFamily: "monospace", fontSize: 11 }} />
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ maxWidth: 1152, mx: "auto", px: 3, py: 4 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            mb: 4,
            borderBottom: "1px solid",
            borderColor: "grey.800",
            "& .MuiTab-root": { color: "grey.500", textTransform: "none", fontWeight: 600, fontSize: 13, minHeight: 48 },
            "& .Mui-selected": { color: "#818cf8" },
            "& .MuiTabs-indicator": { bgcolor: "#818cf8" },
          }}
        >
          <Tab icon={<AttachMoneyIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Cost" />
          <Tab icon={<WorkIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Jobs" />
          <Tab icon={<PeopleIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Invites" />
        </Tabs>

        {tab === 0 && <CostTab />}
        {tab === 1 && <JobsTab />}
        {tab === 2 && <InvitesTab />}
      </Box>
    </Box>
  );
}
