import { Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";

interface Props {
  session: Session | null;
  isLoading: boolean;
  children: ReactNode;
}

export default function ProtectedRoute({ session, isLoading, children }: Props) {
  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
