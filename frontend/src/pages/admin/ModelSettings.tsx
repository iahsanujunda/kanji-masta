import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminBottomDrawer from "@/pages/admin/AdminBottomDrawer";
import { adminApi } from "@/pages/admin/api";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import type { CatalogModel, ModelConfig } from "@/pages/admin/types";

type Workload = "photo_analysis" | "quiz_generation" | "word_discovery";
type Draft = { photoAnalysisModel: string; quizGenerationModel: string; wordDiscoveryModel: string };

const workloadCopy: Record<Workload, { label: string; key: keyof Draft }> = {
  photo_analysis: { label: "Photo analysis", key: "photoAnalysisModel" },
  quiz_generation: { label: "Quiz generation", key: "quizGenerationModel" },
  word_discovery: { label: "Word discovery", key: "wordDiscoveryModel" },
};

export default function ModelSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const queryClient = useQueryClient();
  const configKey = ["admin-model-config", userId] as const;
  const configs = useQuery({ queryKey: configKey, queryFn: ({ signal }) => adminApi.modelConfigs(signal), enabled: Boolean(user) });
  const source = configs.data?.configs.find((item) => item.status === "active");
  const [draftOverride, setDraftOverride] = useState<Draft | null>(null);
  const draft: Draft = draftOverride ?? (source ? {
    photoAnalysisModel: source.photoAnalysisModel,
    quizGenerationModel: source.quizGenerationModel,
    wordDiscoveryModel: source.wordDiscoveryModel,
  } : { photoAnalysisModel: "", quizGenerationModel: "", wordDiscoveryModel: "" });
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length === 1) return;
    const timer = window.setTimeout(() => setDebounced(normalized), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const models = useQuery({
    queryKey: ["admin-models", userId, workload, debounced],
    queryFn: ({ signal }) => adminApi.models(workload!, debounced, signal),
    enabled: Boolean(user) && workload !== null && (debounced.length === 0 || debounced.length >= 2),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-status", userId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-jobs", userId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: () => adminApi.saveModelConfig(draft),
    onSuccess: async (saved) => {
      queryClient.setQueryData<{ configs: ModelConfig[] }>(configKey, (current) => ({
        configs: [
          saved,
          ...(current?.configs ?? []).filter((item) => item.version !== saved.version && item.status !== "active"),
        ],
      }));
      setDraftOverride(null);
      await refresh();
    },
  });
  const complete = Object.values(draft).every(Boolean);
  const changed = !source || (Object.keys(draft) as Array<keyof Draft>).some((key) => draft[key] !== source[key]);

  const selectModel = (model: CatalogModel) => {
    if (!workload) return;
    const key = workloadCopy[workload].key;
    setDraftOverride({ ...draft, [key]: model.id });
    save.reset();
    setWorkload(null);
    setQuery("");
    setDebounced("");
  };

  return (
    <Box sx={{ bgcolor: "#0f0f16", border: "1px solid #242431", borderRadius: 3, p: 2, display: "grid", gap: 1.25 }}>
      <Box>
        <Typography sx={{ color: "white", fontWeight: 850 }}>Model settings</Typography>
        <Typography sx={{ color: "grey.500", fontSize: 12 }}>Active models. Changes apply only to new attempts.</Typography>
      </Box>
      {configs.isLoading ? [...Array(3)].map((_, index) => (
        <Skeleton key={index} variant="rounded" height={56} sx={{ borderRadius: 2, bgcolor: "#1a1a24" }} />
      )) : (Object.keys(workloadCopy) as Workload[]).map((role) => {
        const config = workloadCopy[role];
        return (
          <Button key={role} aria-label={`Change ${config.label} model`} onClick={() => { setWorkload(role); setQuery(""); setDebounced(""); }} sx={{ minHeight: 56, border: "1px solid #292938", borderRadius: 2, px: 1.5, justifyContent: "space-between", textTransform: "none", color: "grey.200" }}>
            <Box sx={{ textAlign: "left", minWidth: 0 }}>
              <Typography sx={{ fontSize: 12, color: "grey.500" }}>{config.label}</Typography>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, maxWidth: 300 }}>{draft[config.key] || "Choose model"}</Typography>
            </Box>
            <Typography sx={{ color: "#818cf8", fontSize: 12 }}>Change</Typography>
          </Button>
        );
      })}
      {configs.isError && <Alert severity="error">Current model configuration is unavailable.</Alert>}
      {configs.isSuccess && !source && <Alert severity="warning">No active model configuration. Choose all three models, then submit.</Alert>}
      {save.isError && <Alert severity="error">{save.error instanceof ApiError && save.error.status === 422 ? "The selected models are not valid." : "The model configuration could not be saved."}</Alert>}
      {save.isSuccess && <Alert severity="success">Model configuration saved.</Alert>}
      <Button
        aria-label="Submit"
        disabled={!complete || !changed || save.isPending}
        onClick={() => save.mutate()}
        sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", textTransform: "none", fontWeight: 900, "&:hover": { bgcolor: "#34d399" }, "&.Mui-disabled": { bgcolor: "#1a1a24", color: "grey.600" } }}
      >
        {save.isPending ? <CircularProgress size={20} color="inherit" aria-label="Saving model configuration" /> : "Submit"}
      </Button>

      <AdminBottomDrawer open={workload !== null} title="Search OpenRouter models" onClose={() => setWorkload(null)}>
        <TextField
          fullWidth
          autoFocus
          label="Search OpenRouter models"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          helperText={query.trim().length === 1 ? "Type at least 2 characters" : workload ? `Compatible with ${workloadCopy[workload].label.toLowerCase()}` : ""}
          sx={{ mt: .5, mb: 2 }}
        />
        {models.isFetching && <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress size={24} /></Box>}
        {models.isError && <Alert severity="error" action={<Button onClick={() => models.refetch()}>Retry</Button>}>Model catalog unavailable.</Alert>}
        {!models.isFetching && !models.isError && models.data?.models.length === 0 && <Typography sx={{ py: 4, color: "grey.500", textAlign: "center" }}>No compatible models found.</Typography>}
        <Box sx={{ display: "grid", gap: 1 }}>
          {models.data?.models.map((model) => (
            <Button key={model.id} onClick={() => selectModel(model)} sx={{ minHeight: 58, border: "1px solid #292938", borderRadius: 2, px: 1.5, justifyContent: "flex-start", textAlign: "left", textTransform: "none" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: "grey.100", fontWeight: 800 }}>{model.name}</Typography>
                <Typography noWrap sx={{ color: "grey.500", fontSize: 12 }}>{model.id}</Typography>
              </Box>
            </Button>
          ))}
        </Box>
        <Button fullWidth onClick={() => setWorkload(null)} sx={{ minHeight: 44, mt: 2, color: "grey.400", textTransform: "none" }}>Cancel</Button>
      </AdminBottomDrawer>
    </Box>
  );
}
