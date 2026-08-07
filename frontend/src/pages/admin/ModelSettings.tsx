import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Skeleton, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminBottomDrawer from "@/pages/admin/AdminBottomDrawer";
import { adminApi } from "@/pages/admin/api";
import {
  draftFromConfig,
  isChangedDraft,
  isCompleteDraft,
  selectModel,
  selectReasoning,
  supportedReasoningEfforts,
  WORKLOAD_ORDER,
  WORKLOADS,
  type ModelDraft,
  type Workload,
} from "@/pages/admin/modelConfig";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import type { CatalogModel, ModelConfig } from "@/pages/admin/types";

type DrawerState = { kind: "model" | "reasoning"; workload: Workload } | null;

function WorkloadField({
  workload,
  draft,
  onChooseModel,
  onChooseReasoning,
}: {
  workload: Workload;
  draft: ModelDraft;
  onChooseModel: () => void;
  onChooseReasoning: () => void;
}) {
  const definition = WORKLOADS[workload];
  const model = draft[definition.modelKey];
  const reasoning = draft[definition.reasoningKey];
  return (
    <Box sx={{ border: "1px solid #292938", borderRadius: 2.5, overflow: "hidden", bgcolor: "#0d0d14" }}>
      <Box sx={{ px: 1.5, pt: 1.25, pb: .5, display: "flex", alignItems: "center", gap: 1 }}>
        <Typography sx={{ color: "grey.100", fontSize: 13, fontWeight: 850 }}>{definition.label}</Typography>
        {definition.requiresImage && (
          <Typography sx={{ ml: "auto", px: 1, py: .25, borderRadius: 5, border: "1px solid rgba(52,211,153,.28)", color: "#6ee7b7", bgcolor: "rgba(52,211,153,.08)", fontSize: 9, fontWeight: 850, letterSpacing: .7 }}>
            IMAGE INPUT
          </Typography>
        )}
      </Box>
      <Button
        fullWidth
        aria-label={`Change ${definition.label} model`}
        onClick={onChooseModel}
        sx={{ minHeight: 48, px: 1.5, justifyContent: "space-between", textTransform: "none", borderRadius: 0, color: "grey.200", "&:active": { transform: "translateY(1px)" } }}
      >
        <Box sx={{ textAlign: "left", minWidth: 0 }}>
          <Typography sx={{ color: "grey.600", fontSize: 9, fontWeight: 800, letterSpacing: .8 }}>MODEL</Typography>
          <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, maxWidth: 285 }}>{model || "Choose model"}</Typography>
        </Box>
        <Typography sx={{ color: "#818cf8", fontSize: 11 }}>Change</Typography>
      </Button>
      <Box sx={{ mx: 1.5, borderTop: "1px solid #242431" }} />
      <Button
        fullWidth
        disabled={!model}
        aria-label={`Change ${definition.label} reasoning`}
        onClick={onChooseReasoning}
        sx={{ minHeight: 44, px: 1.5, justifyContent: "space-between", textTransform: "none", borderRadius: 0, color: "grey.200", "&:active": { transform: "translateY(1px)" } }}
      >
        <Box sx={{ textAlign: "left" }}>
          <Typography sx={{ color: "grey.600", fontSize: 9, fontWeight: 800, letterSpacing: .8 }}>REASONING</Typography>
          <Typography sx={{ color: reasoning ? "#a5b4fc" : "grey.500", fontSize: 12, fontWeight: 800, textTransform: "capitalize" }}>
            {reasoning || (model ? "Choose level" : "Choose a model first")}
          </Typography>
        </Box>
        {model && <Typography sx={{ color: "#818cf8", fontSize: 11 }}>Change</Typography>}
      </Button>
    </Box>
  );
}

export default function ModelSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const queryClient = useQueryClient();
  const configKey = ["admin-model-config", userId] as const;
  const configs = useQuery({ queryKey: configKey, queryFn: ({ signal }) => adminApi.modelConfigs(signal), enabled: Boolean(user) });
  const source = configs.data?.configs.find((item) => item.status === "active");
  const [draftOverride, setDraftOverride] = useState<ModelDraft | null>(null);
  const draft = draftOverride ?? draftFromConfig(source);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedMetadata, setSelectedMetadata] = useState<Partial<Record<Workload, CatalogModel>>>({});

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length === 1) return;
    const timer = window.setTimeout(() => setDebounced(normalized), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const modelWorkload = drawer?.kind === "model" ? drawer.workload : null;
  const models = useQuery({
    queryKey: ["admin-models", userId, modelWorkload, debounced],
    queryFn: ({ signal }) => adminApi.models(modelWorkload!, debounced, signal),
    enabled: Boolean(user) && modelWorkload !== null && (debounced.length === 0 || debounced.length >= 2),
  });

  const reasoningWorkload = drawer?.kind === "reasoning" ? drawer.workload : null;
  const reasoningModelId = reasoningWorkload ? draft[WORKLOADS[reasoningWorkload].modelKey] : "";
  const knownReasoningModel = reasoningWorkload ? selectedMetadata[reasoningWorkload] : undefined;
  const reasoningModel = useQuery({
    queryKey: ["admin-model-reasoning", userId, reasoningWorkload, reasoningModelId],
    queryFn: async ({ signal }) => {
      const response = await adminApi.models(reasoningWorkload!, reasoningModelId, signal);
      return response.models.find((model) => model.id === reasoningModelId) ?? null;
    },
    enabled: Boolean(user) && reasoningWorkload !== null && Boolean(reasoningModelId) && !knownReasoningModel,
  });
  const activeReasoningModel = knownReasoningModel ?? reasoningModel.data ?? null;
  const reasoningOptions = useMemo(
    () => activeReasoningModel ? supportedReasoningEfforts(activeReasoningModel) : [],
    [activeReasoningModel],
  );

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
        configs: [saved, ...(current?.configs ?? []).filter((item) => item.version !== saved.version && item.status !== "active")],
      }));
      setDraftOverride(null);
      setSelectedMetadata({});
      await refresh();
    },
  });

  const openModelPicker = (workload: Workload) => {
    setDrawer({ kind: "model", workload });
    setQuery("");
    setDebounced("");
  };
  const chooseModel = (model: CatalogModel) => {
    if (!modelWorkload) return;
    setDraftOverride(selectModel(draft, modelWorkload, model));
    setSelectedMetadata((current) => ({ ...current, [modelWorkload]: model }));
    save.reset();
    setQuery("");
    setDebounced("");
    setDrawer({ kind: "reasoning", workload: modelWorkload });
  };
  const chooseReasoning = (effort: string) => {
    if (!reasoningWorkload || !reasoningOptions.includes(effort)) return;
    setDraftOverride(selectReasoning(draft, reasoningWorkload, effort));
    save.reset();
    setDrawer(null);
  };

  return (
    <Box sx={{ bgcolor: "#0f0f16", border: "1px solid #242431", borderRadius: 3, p: 2, display: "grid", gap: 1.25 }}>
      <Box>
        <Typography sx={{ color: "white", fontWeight: 850 }}>Model settings</Typography>
        <Typography sx={{ color: "grey.500", fontSize: 12 }}>Model and reasoning are versioned together for new attempts.</Typography>
      </Box>
      {configs.isLoading ? [...Array(4)].map((_, index) => (
        <Skeleton key={index} variant="rounded" height={118} sx={{ borderRadius: 2, bgcolor: "#1a1a24" }} />
      )) : WORKLOAD_ORDER.map((workload) => (
        <WorkloadField
          key={workload}
          workload={workload}
          draft={draft}
          onChooseModel={() => openModelPicker(workload)}
          onChooseReasoning={() => setDrawer({ kind: "reasoning", workload })}
        />
      ))}
      {configs.isError && <Alert severity="error">Current model configuration is unavailable.</Alert>}
      {configs.isSuccess && !source && <Alert severity="warning">No active model configuration. Choose a model and reasoning level for all four workloads.</Alert>}
      {save.isError && <Alert severity="error">{save.error instanceof ApiError && save.error.status === 422 ? "The selected models or reasoning levels are not valid." : "The model configuration could not be saved."}</Alert>}
      {save.isSuccess && <Alert severity="success">Model configuration saved.</Alert>}
      <Button
        aria-label="Submit"
        disabled={!isCompleteDraft(draft) || !isChangedDraft(draft, source) || save.isPending}
        onClick={() => save.mutate()}
        sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", textTransform: "none", fontWeight: 900, "&:hover": { bgcolor: "#34d399" }, "&:active": { transform: "translateY(1px)" }, "&.Mui-disabled": { bgcolor: "#1a1a24", color: "grey.600" } }}
      >
        {save.isPending ? <CircularProgress size={20} color="inherit" aria-label="Saving model configuration" /> : "Submit new configuration"}
      </Button>

      <AdminBottomDrawer open={drawer?.kind === "model"} title={modelWorkload ? `Choose ${WORKLOADS[modelWorkload].label.toLowerCase()} model` : "Choose model"} onClose={() => setDrawer(null)}>
        {modelWorkload && WORKLOADS[modelWorkload].requiresImage && (
          <Box sx={{ display: "inline-flex", alignItems: "center", mb: 1.5, px: 1.25, py: .65, borderRadius: 5, border: "1px solid rgba(52,211,153,.28)", bgcolor: "rgba(52,211,153,.08)" }}>
            <Typography sx={{ color: "#6ee7b7", fontSize: 11, fontWeight: 850 }}>Image input · required</Typography>
          </Box>
        )}
        <TextField
          fullWidth
          autoFocus
          label="Search OpenRouter models"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          helperText={query.trim().length === 1 ? "Type at least 2 characters" : modelWorkload ? `Compatible with ${WORKLOADS[modelWorkload].label.toLowerCase()}` : ""}
          sx={{ mb: 2 }}
        />
        {models.isFetching && <Box sx={{ display: "grid", gap: 1 }}>{[...Array(3)].map((_, index) => <Skeleton key={index} variant="rounded" height={74} sx={{ bgcolor: "#0f0f16" }} />)}</Box>}
        {models.isError && <Alert severity="error" action={<Button onClick={() => models.refetch()}>Retry</Button>}>Model catalog unavailable.</Alert>}
        {!models.isFetching && !models.isError && models.data?.models.length === 0 && <Typography sx={{ py: 4, color: "grey.500", textAlign: "center" }}>No compatible models found.</Typography>}
        <Box sx={{ display: "grid", gap: 1 }}>
          {models.data?.models.map((model) => (
            <Button key={model.id} onClick={() => chooseModel(model)} sx={{ minHeight: 70, border: "1px solid #292938", borderRadius: 2, px: 1.5, justifyContent: "flex-start", textAlign: "left", textTransform: "none", "&:active": { transform: "translateY(1px)" } }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: "grey.100", fontWeight: 800 }}>{model.name}</Typography>
                <Typography noWrap sx={{ color: "grey.500", fontSize: 12 }}>{model.id}</Typography>
                <Typography sx={{ color: "#a5b4fc", fontSize: 10, mt: .5 }}>Reasoning · {supportedReasoningEfforts(model).join(", ")}</Typography>
              </Box>
            </Button>
          ))}
        </Box>
        <Button fullWidth onClick={() => setDrawer(null)} sx={{ minHeight: 44, mt: 2, color: "grey.400", textTransform: "none" }}>Cancel</Button>
      </AdminBottomDrawer>

      <AdminBottomDrawer open={drawer?.kind === "reasoning"} title="Choose reasoning level" onClose={() => setDrawer(null)}>
        <Typography sx={{ color: "grey.300", fontSize: 13, mb: .5 }}>{activeReasoningModel?.name ?? reasoningModelId}</Typography>
        <Typography sx={{ color: "grey.500", fontSize: 11, mb: 2 }}>Only levels advertised by this model are available.</Typography>
        {reasoningModel.isFetching && !activeReasoningModel && <Box sx={{ display: "grid", gap: 1 }}>{[...Array(3)].map((_, index) => <Skeleton key={index} variant="rounded" height={58} sx={{ bgcolor: "#0f0f16" }} />)}</Box>}
        {reasoningModel.isError && <Alert severity="error" action={<Button onClick={() => reasoningModel.refetch()}>Retry</Button>}>Supported reasoning levels are unavailable.</Alert>}
        {!reasoningModel.isFetching && !reasoningModel.isError && reasoningOptions.length === 0 && <Alert severity="warning">This model no longer advertises selectable reasoning levels. Choose another model.</Alert>}
        <Box sx={{ display: "grid", gap: 1 }}>
          {reasoningOptions.map((effort) => {
            const selected = reasoningWorkload ? draft[WORKLOADS[reasoningWorkload].reasoningKey] === effort : false;
            const isDefault = activeReasoningModel?.defaultReasoningEffort === effort;
            return (
              <Button
                key={effort}
                aria-pressed={selected}
                onClick={() => chooseReasoning(effort)}
                sx={{ minHeight: 58, border: selected ? "1px solid rgba(129,140,248,.55)" : "1px solid #292938", bgcolor: selected ? "rgba(129,140,248,.10)" : "#0f0f16", borderRadius: 2, px: 1.5, justifyContent: "space-between", textTransform: "none", "&:active": { transform: "translateY(1px)" } }}
              >
                <Typography sx={{ color: "grey.100", fontWeight: 850, textTransform: "capitalize" }}>{effort}</Typography>
                {isDefault && <Typography sx={{ px: 1, py: .25, borderRadius: 5, color: "#6ee7b7", bgcolor: "rgba(52,211,153,.08)", fontSize: 9, fontWeight: 850 }}>MODEL DEFAULT</Typography>}
              </Button>
            );
          })}
        </Box>
        <Button fullWidth onClick={() => setDrawer(null)} sx={{ minHeight: 44, mt: 2, color: "grey.400", textTransform: "none" }}>Cancel</Button>
      </AdminBottomDrawer>
    </Box>
  );
}
