import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PageHeader from "@/components/PageHeader";
import { LESSONS, isLessonCompleted, markLessonCompleted } from "@/lib/insights";

export default function InsightDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lesson = LESSONS.find((l) => l.id === id);

  const [completed, setCompleted] = useState(() => (lesson ? isLessonCompleted(lesson.id) : false));

  if (!lesson) {
    return (
      <Box sx={{ minHeight: "var(--app-height)", maxWidth: 480, mx: "auto", display: "flex", flexDirection: "column" }}>
        <PageHeader title="Lesson" onBack={() => navigate(-1)} />
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography color="text.secondary">Lesson not found.</Typography>
        </Box>
      </Box>
    );
  }

  const handleComplete = () => {
    markLessonCompleted(lesson.id);
    setCompleted(true);
    navigate(-1);
  };

  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
        maxWidth: 480,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <PageHeader
        title=""
        subtitle={
          <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "text.disabled" }}>
            Methodology
          </Typography>
        }
        onBack={() => navigate(-1)}
      />

      {/* Article */}
      <Box sx={{ flex: 1, px: 3, pb: 16, overflow: "auto" }}>
        <Box sx={{ py: 2 }}>
          <Typography variant="h4" fontWeight={900} sx={{ mb: 1.5, lineHeight: 1.2 }}>
            {lesson.title}
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary", mb: 5, lineHeight: 1.7 }}>
            {lesson.teaser}
          </Typography>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {lesson.content.map((block, idx) => {
              if (block.type === "heading") {
                return (
                  <Typography key={idx} variant="h6" fontWeight="bold" sx={{ mt: 2, color: "text.primary" }}>
                    {block.text}
                  </Typography>
                );
              }
              if (block.type === "paragraph") {
                return (
                  <Typography key={idx} variant="body1" sx={{ color: "text.secondary", lineHeight: 1.8 }}>
                    {block.text}
                  </Typography>
                );
              }
              if (block.type === "callout") {
                return (
                  <Box
                    key={idx}
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      bgcolor: lesson.accentBg,
                      borderLeft: `4px solid ${lesson.accentColor}`,
                      my: 1,
                    }}
                  >
                    <Typography variant="body1" fontWeight="medium" sx={{ color: "text.primary", lineHeight: 1.7 }}>
                      {block.text}
                    </Typography>
                  </Box>
                );
              }
              if (block.type === "comparison") {
                return (
                  <Box key={idx} sx={{ display: "flex", gap: 2, my: 1 }}>
                    <Box
                      sx={{
                        flex: 1, bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800",
                        borderRadius: 3, p: 2.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                      }}
                    >
                      <Typography sx={{ fontSize: "2.5rem", color: "grey.600" }}>{block.bad.char}</Typography>
                      <Typography variant="caption" sx={{ color: "grey.600", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                        {block.bad.label}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        flex: 1, bgcolor: lesson.accentBg, border: "1px solid", borderColor: `${lesson.accentColor}4D`,
                        borderRadius: 3, p: 2.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                      }}
                    >
                      <Typography sx={{ fontSize: "2.5rem", color: lesson.accentColor }}>{block.good.char}</Typography>
                      <Typography variant="caption" sx={{ color: lesson.accentColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>
                        {block.good.label}
                      </Typography>
                    </Box>
                  </Box>
                );
              }
              return null;
            })}
          </Box>
        </Box>
      </Box>

      {/* Sticky footer CTA */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          pb: 4,
          pt: 6,
          background: (theme) => `linear-gradient(transparent, ${theme.palette.background.default} 40%)`,
          pointerEvents: "none",
        }}
      >
        <Button
          variant="contained"
          size="large"
          onClick={handleComplete}
          startIcon={completed ? <CheckCircleIcon /> : undefined}
          sx={{
            pointerEvents: "auto",
            maxWidth: 480 - 48,
            width: "100%",
            mx: 3,
            py: 2,
            borderRadius: 8,
            fontSize: "1rem",
            fontWeight: "bold",
            ...(completed
              ? { bgcolor: "grey.800", color: "grey.500", border: "1px solid", borderColor: "grey.700", "&:hover": { bgcolor: "grey.800" } }
              : { bgcolor: "#10b981", color: "black", "&:hover": { bgcolor: "#34d399" }, boxShadow: "0 0 30px rgba(16,185,129,0.3)" }
            ),
          }}
        >
          {completed ? "Lesson Complete" : "Mark as Complete"}
        </Button>
      </Box>
    </Box>
  );
}
