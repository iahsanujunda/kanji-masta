import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminBottomDrawer from "@/pages/admin/AdminBottomDrawer";
import { adminApi } from "@/pages/admin/api";
import { useAuth } from "@/hooks/useAuth";
import type { CatalogModel } from "@/pages/admin/types";

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
  const configs = useQuery({ queryKey: ["admin-model-config", userId], queryFn: ({ signal }) => adminApi.modelConfigs(signal), enabled: Boolean(user) });
  const source = configs.data?.configs.find((item) => item.status === "draft") ?? configs.data?.configs.find((item) => item.status === "active");
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
      queryClient.invalidateQueries({ queryKey: ["admin-model-config", userId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-status", userId] }),
      queryClient.invalidateQueries({ queryKey: ["admin-jobs", userId] }),
    ]);
  };
  const validate = useMutation({
    mutationFn: () => adminApi.validateConfig(draft),
    onSuccess: async () => { setDraftOverride(null); await refresh(); },
  });
  const activatable = configs.data?.configs.find((item) => item.status === "draft" && item.validationStatus === "passed");
  const activate = useMutation({ mutationFn: (version: number) => adminApi.activateConfig(version), onSuccess: refresh });
  const complete = Object.values(draft).every(Boolean);

  const selectModel = (model: CatalogModel) => {
    if (!workload) return;
    const key = workloadCopy[workload].key;
    setDraftOverride({ ...draft, [key]: model.id });
    setWorkload(null);
    setQuery("");
    setDebounced("");
  };

  return (
    <Box sx={{ bgcolor: "#0f0f16", border: "1px solid #242431", borderRadius: 3, p: 2, display: "grid", gap: 1.25 }}>
      <Box>
        <Typography sx={{ color: "white", fontWeight: 850 }}>Model settings</Typography>
        <Typography sx={{ color: "grey.500", fontSize: 12 }}>Validated changes apply only to new attempts.</Typography>
      </Box>
      {(Object.keys(workloadCopy) as Workload[]).map((role) => {
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
      {(validate.isError || activate.isError) && <Alert severity="error">The model configuration could not be saved.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: activatable ? "1fr 1fr" : "1fr", gap: 1 }}>
        <Button disabled={!complete || validate.isPending} onClick={() => validate.mutate()} sx={{ minHeight: 44, bgcolor: "#1a1a24", color: "grey.100", textTransform: "none", fontWeight: 800 }}>Validate draft</Button>
        {activatable && <Button disabled={activate.isPending} onClick={() => activate.mutate(activatable.version)} sx={{ minHeight: 44, bgcolor: "#10b981", color: "#050508", textTransform: "none", fontWeight: 900 }}>Activate v{activatable.version}</Button>}
      </Box>

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
