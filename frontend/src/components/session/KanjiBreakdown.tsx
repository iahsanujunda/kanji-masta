import { Box, Typography } from "@mui/material";
import type { KanjiBreakdownItem } from "@/lib/session";

export default function KanjiBreakdown({ items }: { items: KanjiBreakdownItem[] }) {
  if (!items.length) return null;
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 1 }}>
      {items.map((item) => (
        <Box key={`${item.character}-${item.meaning}`} sx={{ display: "flex", alignItems: "baseline", gap: 0.75, px: 1.25, py: 0.75, bgcolor: "#1a1a24", borderRadius: 2 }}>
          <Typography sx={{ color: "#a5b4fc", fontSize: "1.15rem", fontWeight: 700 }}>{item.character}</Typography>
          <Typography variant="caption" color="text.secondary">{item.meaning}</Typography>
        </Box>
      ))}
    </Box>
  );
}
