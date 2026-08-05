import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import AdminBottomDrawer from "@/pages/admin/AdminBottomDrawer";
import ModelSettings from "@/pages/admin/ModelSettings";
import { adminApi } from "@/pages/admin/api";
import type { JobItem } from "@/pages/admin/types";

const filters = ["all", "needs-action", "pending", "processing", "failed", "done"] as const;
const statusColor: Record<string, string> = { pending: "#a5b4fc", processing: "#818cf8", done: "#34d399", failed: "#f87171" };

export default function JobsTab() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [selected, setSelected] = useState<JobItem | null>(null);
  const [action, setAction] = useState<"fail" | "rerun" | null>(null);
  const jobs = useQuery({
    queryKey: ["admin-jobs", filter],
    queryFn: ({ signal }) => adminApi.jobs(filter, signal),
    refetchInterval: 15_000,
  });
  const detail = useQuery({
    queryKey: ["admin-job", selected?.type, selected?.id],
    queryFn: ({ signal }) => adminApi.job(selected!.type, selected!.id, signal),
    enabled: selected !== null,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-job"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-status"] }),
      queryClient.invalidateQueries({ queryKey: ["photo-activity"] }),
      queryClient.invalidateQueries({ queryKey: ["photo-activity-unseen"] }),
      queryClient.invalidateQueries({ queryKey: ["photo-session"] }),
    ]);
  };
  const command = useMutation({
    mutationFn: async () => {
      if (!selected || !action) throw new Error("No job selected");
      return action === "fail" ? adminApi.failJob(selected.type, selected.id) : adminApi.rerunJob(selected.type, selected.id);
    },
    onSuccess: async () => { await refresh(); setAction(null); setSelected(null); },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) await refresh();
    },
  });

  const visibleJobs = filter === "needs-action"
    ? jobs.data?.jobs.filter((job) => job.status === "failed" || job.stale)
    : jobs.data?.jobs;

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: .75, overflowX: "auto", pb: .5, scrollbarWidth: "none" }}>
        {filters.map((item) => <Chip key={item} clickable label={item.replace("-", " ")} onClick={() => setFilter(item)} sx={{ flexShrink: 0, height: 36, textTransform: "capitalize", bgcolor: filter === item ? "#4338ca" : "#15151e", color: filter === item ? "white" : "grey.400", border: "1px solid #292938" }} />)}
      </Box>
      {jobs.isLoading && <Box sx={{ py: 6, textAlign: "center" }}><CircularProgress size={28} /></Box>}
      {jobs.isError && <Alert severity="error" action={<Button onClick={() => jobs.refetch()}>Retry</Button>}>Jobs are unavailable.</Alert>}
      {!jobs.isLoading && visibleJobs?.length === 0 && <Box sx={{ bgcolor: "#0f0f16", border: "1px solid #242431", borderRadius: 3, p: 3, textAlign: "center" }}><Typography color="grey.500">No jobs in this view.</Typography></Box>}
      {visibleJobs?.map((job) => (
        <Button key={`${job.type}-${job.id}`} aria-label={`View ${job.summary} job ${job.id}`} onClick={() => setSelected(job)} sx={{ display: "block", minHeight: 112, bgcolor: "#0f0f16", border: `1px solid ${job.stale ? "rgba(248,113,113,.5)" : "#242431"}`, borderRadius: 3, p: 2, textAlign: "left", textTransform: "none", color: "inherit" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
            <Box>
              <Typography sx={{ color: "white", fontWeight: 850 }}>{job.summary}</Typography>
              <Typography sx={{ color: "grey.500", fontSize: 12, mt: .25 }}>{job.type.replace("_", " ")} · {job.userId.slice(0, 10)}</Typography>
            </Box>
            <Chip label={job.stale ? "needs action" : job.status} size="small" sx={{ bgcolor: "#1a1a24", color: job.stale ? "#f87171" : statusColor[job.status], fontWeight: 800, fontSize: 10 }} />
          </Box>
          <Typography sx={{ color: "grey.500", fontSize: 12, mt: 2 }}>Attempt {job.attempts}/{job.maxAttempts} · Updated {new Date(job.updatedAt || job.createdAt).toLocaleString()}</Typography>
        </Button>
      ))}
      <ModelSettings />

      <AdminBottomDrawer open={selected !== null && action === null} title="Job details" onClose={() => setSelected(null)}>
        {detail.isLoading && <Box sx={{ py: 5, textAlign: "center" }}><CircularProgress size={24} /></Box>}
        {detail.isError && <Alert severity="error" action={<Button onClick={() => detail.refetch()}>Retry</Button>}>Job details are unavailable.</Alert>}
        {detail.data && <Box sx={{ display: "grid", gap: 1.5 }}>
          <Box sx={{ bgcolor: "#15151e", borderRadius: 2.5, p: 2 }}>
            <Typography sx={{ color: "white", fontWeight: 850 }}>{detail.data.job.summary}</Typography>
            <Typography sx={{ color: "grey.500", fontSize: 12 }}>{detail.data.job.id}</Typography>
          </Box>
          <Typography sx={{ color: "grey.400", fontSize: 11, fontWeight: 800 }}>ATTEMPT HISTORY</Typography>
          {detail.data.attempts.map((attempt) => <Box key={attempt.id} sx={{ borderLeft: `2px solid ${statusColor[attempt.status]}`, pl: 1.5, py: .5 }}>
            <Typography sx={{ color: "grey.200", fontSize: 13, fontWeight: 700 }}>#{attempt.attemptNumber} · {attempt.status}</Typography>
            <Typography sx={{ color: "grey.500", fontSize: 11 }}>{attempt.trigger}{attempt.modelId ? ` · ${attempt.modelId}` : ""}</Typography>
          </Box>)}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1 }}>
            <Button disabled={!(["pending", "processing"].includes(detail.data.job.status))} onClick={() => setAction("fail")} sx={{ minHeight: 48, border: "1px solid rgba(248,113,113,.5)", color: "#f87171", textTransform: "none", fontWeight: 800 }}>Mark failed</Button>
            <Button disabled={detail.data.job.status !== "failed" && !detail.data.job.stale} onClick={() => setAction("rerun")} sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", textTransform: "none", fontWeight: 900 }}>Rerun</Button>
          </Box>
          <Button onClick={() => setSelected(null)} sx={{ minHeight: 44, color: "grey.400", textTransform: "none" }}>Close</Button>
        </Box>}
      </AdminBottomDrawer>

      <AdminBottomDrawer open={selected !== null && action !== null} title={action === "fail" ? "Mark job failed?" : "Rerun job?"} onClose={() => setAction(null)} submitting={command.isPending}>
        <Typography sx={{ color: "grey.300", mb: 2 }}>{selected?.summary} will {action === "fail" ? "stop showing as active immediately" : "keep its history and start a new attempt"}.</Typography>
        {command.isError && <Alert severity="error" sx={{ mb: 2 }}>{command.error instanceof ApiError && command.error.status === 409 ? "This job changed. Review the refreshed state before trying again." : "The job action failed."}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <Button disabled={command.isPending} onClick={() => setAction(null)} sx={{ minHeight: 48, bgcolor: "#1a1a24", color: "grey.200", textTransform: "none", fontWeight: 800 }}>Cancel</Button>
          <Button disabled={command.isPending} onClick={() => command.mutate()} sx={{ minHeight: 48, bgcolor: action === "fail" ? "#ef4444" : "#10b981", color: "#050508", textTransform: "none", fontWeight: 900 }}>{command.isPending ? "Working…" : "Confirm"}</Button>
        </Box>
      </AdminBottomDrawer>
    </Box>
  );
}
