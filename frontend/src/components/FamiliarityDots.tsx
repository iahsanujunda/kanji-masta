import { Box } from "@mui/material";

interface Props {
  value: number;
  color?: string;
  size?: number;
}

export default function FamiliarityDots({ value, color, size = 6 }: Props) {
  const mastered = value === 5;
  const filledColor = color ?? (mastered ? "primary.light" : "secondary.light");
  const glowSx = mastered && !color ? { boxShadow: (theme: import("@mui/material/styles").Theme) => theme.palette.app.shadow.familiarityGlow } : {};

  return (
    <Box sx={{ display: "flex", gap: 0.75 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Box
          key={i}
          sx={{
            width: size,
            height: size,
            borderRadius: "50%",
            bgcolor: i < value ? filledColor : "grey.800",
            ...(i < value ? glowSx : {}),
          }}
        />
      ))}
    </Box>
  );
}
