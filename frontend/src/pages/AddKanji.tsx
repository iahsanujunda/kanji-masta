import { Box, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PageHeader from "@/components/PageHeader";

export default function AddKanji() {
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
      <PageHeader title="Add Kanji" backTo="/collection" />

      <Box sx={{ px: 3, pt: 2 }}>
        <TextField
          fullWidth
          placeholder="Search kanji..."
          disabled
          slotProps={{
            input: {
              startAdornment: <SearchIcon sx={{ color: "grey.600", mr: 1 }} />,
            },
          }}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
        />

        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            Coming Soon
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Search and add kanji from the master list.
            <br />
            For now, use Capture to discover new kanji.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
