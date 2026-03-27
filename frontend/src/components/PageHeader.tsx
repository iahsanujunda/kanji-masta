import { useNavigate } from "react-router-dom";
import { Box, IconButton, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  right?: ReactNode;
  sx?: object;
  backButtonSx?: object;
}

export default function PageHeader({ title, subtitle, backTo, onBack, right, sx, backButtonSx }: Props) {
  const navigate = useNavigate();
  const showBack = backTo || onBack;

  return (
    <Box sx={{ px: 3, pt: 5, pb: 2, display: "flex", alignItems: "center", gap: 1.5, ...sx }}>
      {showBack && (
        <IconButton
          onClick={() => onBack ? onBack() : navigate(backTo!)}
          sx={{
            bgcolor: "action.hover",
            "&:hover": { bgcolor: "action.selected" },
            ...backButtonSx,
          }}
        >
          <ArrowBackIcon />
        </IconButton>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h5" fontWeight="bold">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
      {right}
    </Box>
  );
}