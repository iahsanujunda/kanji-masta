import { useId } from "react";
import { Box, IconButton, SwipeableDrawer, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

export const DRAWER_ENTER_MS = 300;
export const DRAWER_EXIT_MS = 260;

interface AdminBottomDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  submitting?: boolean;
  children: React.ReactNode;
}

export default function AdminBottomDrawer({
  open,
  title,
  onClose,
  submitting = false,
  children,
}: AdminBottomDrawerProps) {
  const titleId = useId();
  const dismiss = () => {
    if (!submitting) onClose();
  };

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onOpen={() => undefined}
      onClose={dismiss}
      disableSwipeToOpen
      disableEscapeKeyDown={submitting}
      transitionDuration={{ enter: DRAWER_ENTER_MS, exit: DRAWER_EXIT_MS }}
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        role: "dialog",
        "aria-modal": true,
        "aria-labelledby": titleId,
        "data-admin-drawer": "true",
        sx: {
          width: "min(100vw, 480px)",
          maxHeight: "min(88dvh, 760px)",
          mx: "auto",
          left: 0,
          right: 0,
          borderRadius: "24px 24px 0 0",
          border: "1px solid #2a2a38",
          borderBottom: 0,
          bgcolor: "#0f0f16",
          backgroundImage: "none",
          color: "grey.100",
          overflow: "hidden",
          willChange: "transform",
          transitionProperty: "transform !important",
          transitionDuration: `${open ? DRAWER_ENTER_MS : DRAWER_EXIT_MS}ms !important`,
          transitionTimingFunction: `${open ? "cubic-bezier(0.16, 1, 0.3, 1)" : "cubic-bezier(0.4, 0, 1, 1)"} !important`,
          "@media (prefers-reduced-motion: reduce)": {
            transitionDuration: "1ms !important",
          },
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            transitionProperty: "opacity !important",
            transitionDuration: `${open ? 220 : 200}ms !important`,
            transitionTimingFunction: `${open ? "ease-out" : "ease-in"} !important`,
            "@media (prefers-reduced-motion: reduce)": { transitionDuration: "1ms !important" },
          },
        },
      }}
    >
      <Box sx={{ width: 42, height: 4, borderRadius: 2, bgcolor: "grey.700", mx: "auto", mt: 1.25 }} />
      <Box sx={{ px: 2.5, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography id={titleId} sx={{ fontSize: 18, fontWeight: 800 }}>{title}</Typography>
        <IconButton aria-label="Close" onClick={dismiss} disabled={submitting} sx={{ color: "grey.400", minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ overflowY: "auto", px: 2.5, pb: "max(24px, env(safe-area-inset-bottom))" }}>
        {children}
      </Box>
    </SwipeableDrawer>
  );
}
