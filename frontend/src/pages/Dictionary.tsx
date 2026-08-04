import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Chip, InputAdornment, Paper, Skeleton, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PageHeader from "@/components/PageHeader";
import FamiliarityDots from "@/components/FamiliarityDots";
import { apiFetch } from "@/lib/api";
import { formatNextReview } from "@/lib/format";

type LearningState = "WAITING_TO_LEARN" | "WAITING_TO_REVISIT" | "LEARNING" | "REVIEWING" | "MASTERED";
interface WordListItem { id: string; word: string; reading: string; meaning: string; familiarity: number; nextReview: string | null; learningState: LearningState }
interface WordListResponse { words: WordListItem[]; total: number; hasMore: boolean }

const PAGE_SIZE = 30;
const filters: { value: LearningState | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "WAITING_TO_LEARN", label: "New" },
  { value: "LEARNING", label: "Learning" },
  { value: "WAITING_TO_REVISIT", label: "Revisit" },
  { value: "REVIEWING", label: "Reviewing" },
  { value: "MASTERED", label: "Mastered" },
];

const stateLabel: Record<LearningState, string> = {
  WAITING_TO_LEARN: "New",
  WAITING_TO_REVISIT: "Revisit",
  LEARNING: "Learning",
  REVIEWING: "Reviewing",
  MASTERED: "Mastered",
};

export default function Dictionary() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LearningState | "ALL">("ALL");
  const deferredQuery = useDeferredValue(query.trim());
  const sentinelRef = useRef<HTMLDivElement>(null);

  const wordsQuery = useInfiniteQuery({
    queryKey: ["words", deferredQuery, state],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ offset: String(pageParam), limit: String(PAGE_SIZE) });
      if (deferredQuery) params.set("q", deferredQuery);
      if (state !== "ALL") params.set("state", state);
      return apiFetch<WordListResponse>(`/api/words/list?${params}`);
    },
    getNextPageParam: (page, pages) => page.hasMore ? pages.reduce((sum, item) => sum + item.words.length, 0) : undefined,
  });

  const words = wordsQuery.data?.pages.flatMap((page) => page.words) ?? [];
  const total = wordsQuery.data?.pages[0]?.total ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = wordsQuery;

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column" }}>
      <PageHeader title="Dictionary" subtitle={wordsQuery.isLoading ? "Loading…" : `${total} saved ${total === 1 ? "word" : "words"}`} backTo="/home" />
      <Box sx={{ px: 3, mb: 2 }}>
        <TextField
          fullWidth size="small" placeholder="Search kanji, kana, or meaning…" value={query} onChange={(event) => setQuery(event.target.value)}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: "grey.500" }} /></InputAdornment>,
            endAdornment: query ? <InputAdornment position="end"><ClearIcon role="button" aria-label="Clear search" onClick={() => setQuery("")} sx={{ color: "grey.500", fontSize: 19, cursor: "pointer" }} /></InputAdornment> : null,
          } }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3, bgcolor: "#0f0f16" } }}
        />
      </Box>
      <Box sx={{ px: 3, mb: 2.5, display: "flex", gap: 1, overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
        {filters.map((filter) => (
          <Chip key={filter.value} label={filter.label} clickable onClick={() => setState(filter.value)}
            sx={{ flexShrink: 0, bgcolor: state === filter.value ? "#4338ca" : "#1a1a24", color: state === filter.value ? "white" : "grey.400", fontWeight: 700 }} />
        ))}
      </Box>
      <Box sx={{ flex: 1, px: 3, pb: 4, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {wordsQuery.isError && <Alert severity="warning">Couldn’t load your saved words.</Alert>}
        {wordsQuery.isLoading ? [...Array(5)].map((_, index) => <Skeleton key={index} variant="rounded" height={82} sx={{ borderRadius: 3 }} />)
          : words.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8 }}><Typography color="text.secondary">{query || state !== "ALL" ? "No saved words match this view" : "No saved words yet"}</Typography></Box>
          ) : words.map((word) => <WordCard key={word.id} word={word} onOpen={() => navigate(`/dictionary/${word.id}`)} />)}
        <Box ref={sentinelRef} sx={{ height: 1 }} />
        {wordsQuery.isFetchingNextPage && <Skeleton variant="rounded" height={82} sx={{ borderRadius: 3 }} />}
      </Box>
    </Box>
  );
}

function WordCard({ word, onOpen }: { word: WordListItem; onOpen: () => void }) {
  const accent = word.learningState === "MASTERED" ? "#10b981" : word.learningState === "WAITING_TO_REVISIT" ? "#a78bfa" : word.learningState === "WAITING_TO_LEARN" ? "#818cf8" : "#4338ca";
  return (
    <Paper component="button" type="button" onClick={onOpen} variant="outlined" sx={{ width: "100%", borderRadius: 3, p: 2, display: "flex", alignItems: "center", textAlign: "left", color: "inherit", bgcolor: "#0f0f16", borderColor: `${accent}33`, cursor: "pointer", position: "relative", overflow: "hidden", "&:hover": { bgcolor: "#15151e", borderColor: `${accent}70` }, "&:focus-visible": { outline: `2px solid ${accent}`, outlineOffset: 2 } }}>
      <Box sx={{ position: "absolute", inset: "0 auto 0 0", width: 3, bgcolor: accent }} />
      <Box sx={{ minWidth: 0, flex: 1, pl: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.25 }}><Typography fontWeight={800} sx={{ fontSize: "1.12rem" }}>{word.word}</Typography><Typography variant="body2" color="text.secondary">{word.reading}</Typography></Box>
        <Typography variant="body2" color="text.secondary" noWrap>{word.meaning}</Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, ml: 2 }}>
        <Typography variant="caption" fontWeight={800} sx={{ color: accent }}>{word.learningState === "REVIEWING" ? `Tier ${word.familiarity}` : stateLabel[word.learningState]}</Typography>
        {word.familiarity > 0 && <FamiliarityDots value={word.familiarity} />}
        {word.nextReview && <Typography variant="caption" color="text.disabled">{formatNextReview(word.nextReview)}</Typography>}
      </Box>
      <ChevronRightIcon sx={{ color: "grey.700", ml: 1 }} />
    </Paper>
  );
}
