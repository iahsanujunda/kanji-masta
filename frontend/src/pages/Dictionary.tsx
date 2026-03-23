import { useCallback, useEffect, useRef, useState } from "react";
import { Box, InputAdornment, Paper, Skeleton, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import PageHeader from "@/components/PageHeader";
import FamiliarityDots from "@/components/FamiliarityDots";
import { apiFetch } from "@/lib/api";

interface WordListItem {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  familiarity: number;
  nextReview: string | null;
}

interface WordListResponse {
  words: WordListItem[];
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 30;

function formatNextReview(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays} days`;
}

export default function Dictionary() {
  const [words, setWords] = useState<WordListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchWords = useCallback(async (q: string, offset: number, append: boolean) => {
    const isInitial = offset === 0;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
      if (q) params.set("q", q);
      const data = await apiFetch<WordListResponse>(`/api/words/list?${params}`);

      setWords((prev) => (append ? [...prev, ...data.words] : data.words));
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load + search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchWords(query, 0, false);
    }, query ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, fetchWords]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) {
          fetchWords(query, words.length, true);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, words.length, query, fetchWords]);

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
      <PageHeader
        title="Dictionary"
        subtitle={loading ? "Loading..." : `${total} words`}
        backTo="/"
      />

      {/* Search bar */}
      <Box sx={{ px: 3, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search kanji, hiragana, or romaji..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "grey.500" }} />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end" sx={{ cursor: "pointer" }} onClick={() => setQuery("")}>
                  <ClearIcon sx={{ color: "grey.500", fontSize: 18 }} />
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
        />
      </Box>

      {/* Word list */}
      <Box sx={{ flex: 1, px: 3, pb: 4, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 3 }} />
          ))
        ) : words.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography color="text.secondary">
              {query ? "No words match your search" : "No words learned yet"}
            </Typography>
          </Box>
        ) : (
          words.map((w) => (
            <Paper
              key={w.id}
              variant="outlined"
              sx={{
                borderRadius: 3,
                p: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 0.5 }}>
                  <Typography fontWeight="bold" sx={{ fontSize: "1.1rem" }}>{w.word}</Typography>
                  <Typography variant="body2" color="text.secondary">{w.reading}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" noWrap>{w.meaning}</Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, flexShrink: 0, ml: 2 }}>
                <FamiliarityDots value={w.familiarity} />
                {w.nextReview && (
                  <Typography variant="caption" color="text.disabled">{formatNextReview(w.nextReview)}</Typography>
                )}
              </Box>
            </Paper>
          ))
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && <Box ref={sentinelRef} sx={{ height: 1 }} />}
        {loadingMore && <Skeleton variant="rounded" height={72} sx={{ borderRadius: 3 }} />}
      </Box>
    </Box>
  );
}
