import { Box } from "@mui/material";

interface Props {
  value: number;
  color?: string;
  size?: number;
}

export default function FamiliarityDots({ value, color = "#818cf8", size = 6 }: Props) {
  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Box
          key={i}
          sx={{
            width: size,
            height: size,
            borderRadius: "50%",
            bgcolor: i < value ? color : "grey.800",
          }}
        />
      ))}
    </Box>
  );
}
