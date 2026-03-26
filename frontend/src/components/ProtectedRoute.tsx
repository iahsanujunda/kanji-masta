import { Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";

interface Props {
  user: User | null;
  isLoading: boolean;
  children: ReactNode;
}

export default function ProtectedRoute({ user, isLoading, children }: Props) {
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
