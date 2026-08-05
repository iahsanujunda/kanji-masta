import { Alert, Box, Button, Skeleton, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/pages/admin/api";
import { useAuth } from "@/hooks/useAuth";

const card = { bgcolor: "#0f0f16", border: "1px solid #242431", borderRadius: 3, p: 2 };
const usd = (value: number) => `$${(value / 1_000_000).toFixed(2)}`;

export default function CostTab() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["admin-cost", user?.id], queryFn: ({ signal }) => adminApi.cost(signal), enabled: Boolean(user) });
  if (query.isLoading) return <Box sx={card}><Skeleton height={110} /></Box>;
  if (query.isError) return <Alert severity="error" action={<Button onClick={() => query.refetch()}>Retry</Button>}>Cost data is unavailable.</Alert>;
  const data = query.data!;
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Box sx={{ ...card, background: "linear-gradient(135deg, rgba(6,95,70,.45), rgba(49,46,129,.4))" }}>
        <Typography sx={{ color: "#a5b4fc", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>Total spend</Typography>
        <Typography sx={{ color: "white", fontSize: 36, fontWeight: 900, mt: .5 }}>${data.totalDollars}</Typography>
      </Box>
      <Typography sx={{ color: "grey.400", fontSize: 12, fontWeight: 800, mt: 1 }}>BY USER</Typography>
      {data.byUser.length === 0 && <Box sx={card}><Typography color="grey.500">No cost data yet.</Typography></Box>}
      {data.byUser.map((user) => (
        <Box key={user.userId} sx={{ ...card, display: "grid", gap: .75 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
            <Typography sx={{ color: "grey.200", fontWeight: 700 }}>{user.userId.slice(0, 12)}</Typography>
            <Typography sx={{ color: "#34d399", fontWeight: 800 }}>{usd(user.totalMicrodollars)}</Typography>
          </Box>
          <Typography sx={{ color: "grey.500", fontSize: 12 }}>Photos {usd(user.photoMicrodollars)} · Quizzes {usd(user.quizGenMicrodollars)}</Typography>
        </Box>
      ))}
    </Box>
  );
}
