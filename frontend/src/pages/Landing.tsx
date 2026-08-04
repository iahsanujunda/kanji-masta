import { useNavigate } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import CollectionTree from "@/components/CollectionTree";
import productLoopDesktop from "@/assets/landing-product-loop-desktop.svg";
import productLoopMobile from "@/assets/landing-product-loop-mobile.svg";

const PAGE_WIDTH = 1180;

const LEARNING_STEPS = [
  {
    number: "01",
    title: "Notice it",
    copy: "Point Shuukan at a menu, station sign, or screen. It finds the Japanese already living in your day.",
    icon: <CameraAltOutlinedIcon />,
  },
  {
    number: "02",
    title: "Keep it",
    copy: "Choose the words that matter to you. Context and reading stay attached, so they never become anonymous cards.",
    icon: <BookmarkAddOutlinedIcon />,
  },
  {
    number: "03",
    title: "Recall it",
    copy: "A few focused prompts return later. Each answer moves the kanji through the roots, trunk, and canopy.",
    icon: <LightbulbOutlinedIcon />,
  },
];

function LeafMark({ size = 22, color = "#f4f7f5" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19.8 3.3C14.1 4 8.1 6.8 6.7 11.6c-1.1 3.8 1.4 7.3 5.2 7.3 5.6 0 9-5.5 7.9-15.6Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21c2.4-5.4 6.8-8.8 12.3-11.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Brand() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
      <Box sx={{ width: 34, height: 34, borderRadius: "11px", bgcolor: "#133a2b", border: "1px solid #28664e", display: "grid", placeItems: "center" }}>
        <LeafMark size={19} />
      </Box>
      <Typography sx={{ color: "#f2f5f3", fontSize: 19, fontWeight: 750, letterSpacing: "-0.035em" }}>
        Shuukan
      </Typography>
    </Box>
  );
}

function ProductMockup() {
  return (
    <Box
      component="figure"
      sx={{
        m: 0,
        width: "100%",
        position: "relative",
        isolation: "isolate",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: "13% 7% 9% 10%",
          borderRadius: "50%",
          bgcolor: "rgba(26, 91, 65, 0.24)",
          filter: "blur(70px)",
          zIndex: -1,
        },
      }}
    >
      <picture>
        <source media="(min-width: 700px)" srcSet={productLoopDesktop} />
        <Box
          component="img"
          src={productLoopMobile}
          alt="Nakano Station becomes a saved word, a short recall prompt, and visible tree progress in Shuukan"
          fetchPriority="high"
          sx={{
            display: "block",
            width: "100%",
            height: "auto",
            maxHeight: { xs: 630, md: 720 },
            objectFit: "contain",
            transform: { xs: "translateX(1.5%)", md: "none" },
            transition: "transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            "@media (hover: hover)": { "&:hover": { transform: "translate3d(0, -6px, 0)" } },
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        />
      </picture>
      <Typography component="figcaption" sx={{ textAlign: "center", color: "#68746e", fontSize: 11, mt: { xs: -1, md: -3 }, letterSpacing: "0.04em" }}>
        One sighting. Kept in context. Recalled in minutes.
      </Typography>
    </Box>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "#080b0a", color: "#f2f5f3", overflowX: "clip", fontFamily: '"Avenir Next", "Segoe UI", "Noto Sans JP", sans-serif' }}>
      <Box
        component="header"
        sx={{
          position: "fixed",
          inset: "0 0 auto",
          zIndex: 10,
          bgcolor: "rgba(8, 11, 10, 0.86)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid rgba(104, 121, 112, 0.18)",
        }}
      >
        <Box component="nav" aria-label="Public navigation" sx={{ maxWidth: PAGE_WIDTH, height: 72, mx: "auto", px: { xs: 2.25, sm: 4 }, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Brand />
          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1.25 } }}>
            <Button onClick={() => navigate("/login")} sx={{ minHeight: 44, minWidth: { xs: 64, sm: 84 }, color: "#aab5af", textTransform: "none", fontWeight: 650, borderRadius: 2.5, "&:hover": { color: "#f2f5f3", bgcolor: "rgba(255,255,255,0.04)" } }}>
              Log in
            </Button>
            <Button onClick={() => navigate("/signup")} sx={{ minHeight: 44, bgcolor: "#dfe9e4", color: "#0b100d", px: { xs: 2, sm: 2.75 }, borderRadius: 2.5, textTransform: "none", fontWeight: 800, "&:hover": { bgcolor: "#f0f5f2", transform: "translateY(-1px)" }, "&:active": { transform: "scale(0.98)" } }}>
              Start collecting
            </Button>
          </Box>
        </Box>
      </Box>

      <Box component="main">
        <Box component="section" sx={{ position: "relative", minHeight: { lg: "min(900px, 100dvh)" }, pt: { xs: 14, md: 17 }, pb: { xs: 8, md: 12 }, px: { xs: 2.25, sm: 4 } }}>
          <Box sx={{ maxWidth: PAGE_WIDTH, mx: "auto", display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "0.82fr 1.18fr" }, alignItems: "center", gap: { xs: 5, md: 7, lg: 3 } }}>
            <Box sx={{ position: "relative", zIndex: 1, maxWidth: { xs: 640, lg: 520 } }}>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, mb: 3.5, color: "#8dd9b8", fontSize: 12, fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase" }}>
                <Box sx={{ width: 24, height: 1, bgcolor: "#47b884" }} />
                Japanese from your real life
              </Box>
              <Typography component="h1" sx={{ m: 0, maxWidth: 560, fontSize: "clamp(2.75rem, 7.2vw, 4.9rem)", lineHeight: 0.98, letterSpacing: "-0.062em", fontWeight: 760, color: "#f4f7f5" }}>
                Keep the Japanese you notice.
              </Typography>
              <Typography sx={{ mt: 3.5, maxWidth: 520, color: "#9aa59f", fontSize: "clamp(1rem, 1.6vw, 1.2rem)", lineHeight: 1.65 }}>
                Turn signs, menus, and everyday discoveries into a small learning habit. Shuukan remembers where a word came from, then brings it back when you have a minute.
              </Typography>
              <Box sx={{ mt: 4.5, display: "flex", alignItems: { xs: "stretch", sm: "center" }, flexDirection: { xs: "column", sm: "row" }, gap: 1.5 }}>
                <Button
                  onClick={() => navigate("/signup")}
                  endIcon={<ArrowForwardRoundedIcon />}
                  sx={{ minHeight: 52, bgcolor: "#3dbb83", color: "#07100c", px: 3.25, borderRadius: 2.5, textTransform: "none", fontSize: 16, fontWeight: 850, justifyContent: "space-between", "&:hover": { bgcolor: "#64cfa0", transform: "translateY(-1px)" }, "&:active": { transform: "scale(0.98)" } }}
                >
                  Start collecting
                </Button>
                <Button onClick={() => navigate("/login")} sx={{ minHeight: 52, color: "#aeb8b3", px: 2.5, borderRadius: 2.5, textTransform: "none", fontSize: 15, fontWeight: 700, "&:hover": { color: "#f2f5f3", bgcolor: "rgba(255,255,255,0.04)" } }}>
                  I already have an account
                </Button>
              </Box>
              <Typography sx={{ mt: 2.25, color: "#68746e", fontSize: 12.5 }}>
                Free while Shuukan is in early access. No card required.
              </Typography>
            </Box>

            <ProductMockup />
          </Box>
        </Box>

        <Box component="section" aria-labelledby="learning-loop-title" sx={{ bgcolor: "#0c100e", borderBlock: "1px solid #18201c", py: { xs: 9, md: 14 }, px: { xs: 2.25, sm: 4 } }}>
          <Box sx={{ maxWidth: PAGE_WIDTH, mx: "auto", display: "grid", gridTemplateColumns: { xs: "1fr", md: "0.72fr 1.28fr" }, gap: { xs: 5.5, md: 10, lg: 15 } }}>
            <Box>
              <Typography sx={{ color: "#6ec99f", fontSize: 12, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", mb: 2 }}>The learning loop</Typography>
              <Typography id="learning-loop-title" component="h2" sx={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", lineHeight: 1.05, letterSpacing: "-0.045em", fontWeight: 740, maxWidth: 420 }}>
                Your surroundings become the syllabus.
              </Typography>
              <Typography sx={{ mt: 2.5, color: "#8c9892", lineHeight: 1.7, maxWidth: 440 }}>
                No blank deck to configure and no pile of generic vocabulary. Every item starts with something you chose to understand.
              </Typography>
            </Box>

            <Box sx={{ borderTop: "1px solid #2a332f" }}>
              {LEARNING_STEPS.map((step) => (
                <Box key={step.number} sx={{ display: "grid", gridTemplateColumns: { xs: "42px minmax(0, 1fr)", sm: "58px 0.62fr 1.38fr" }, gap: { xs: 2, sm: 3 }, alignItems: "start", py: { xs: 3.5, sm: 4 }, borderBottom: "1px solid #2a332f" }}>
                  <Box sx={{ width: 42, height: 42, border: "1px solid #334039", borderRadius: "50%", color: "#75d0a7", display: "grid", placeItems: "center", "& svg": { fontSize: 20 } }}>{step.icon}</Box>
                  <Box>
                    <Typography sx={{ color: "#59655f", fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", mb: 0.75 }}>{step.number}</Typography>
                    <Typography sx={{ color: "#edf2ef", fontSize: 20, fontWeight: 750, letterSpacing: "-0.02em" }}>{step.title}</Typography>
                  </Box>
                  <Typography sx={{ gridColumn: { xs: "2", sm: "auto" }, color: "#929e98", fontSize: 14.5, lineHeight: 1.65, maxWidth: 470 }}>{step.copy}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box component="section" sx={{ py: { xs: 9, md: 15 }, px: { xs: 2.25, sm: 4 }, position: "relative" }}>
          <Box sx={{ maxWidth: PAGE_WIDTH, mx: "auto", display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.08fr 0.92fr" }, alignItems: "center", gap: { xs: 5, md: 8 } }}>
            <Box sx={{ minHeight: { xs: 410, sm: 500 }, position: "relative", order: { xs: 2, md: 1 }, overflow: "hidden", borderRadius: { xs: 4, md: 6 }, bgcolor: "#0c100e", border: "1px solid #222b27" }}>
              <Box sx={{ position: "absolute", inset: { xs: "-8% -20% -10%", sm: "-4% 2% -8%" }, opacity: 0.88 }}>
                <CollectionTree hoveredZone={null} />
              </Box>
              <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(12,16,14,0.04), rgba(12,16,14,0.78))" }} />
              <Box sx={{ position: "absolute", left: { xs: 20, sm: 30 }, right: { xs: 20, sm: 30 }, bottom: { xs: 20, sm: 28 }, display: "flex", justifyContent: "space-between", alignItems: "end", gap: 2 }}>
                <Box>
                  <Typography sx={{ color: "#80d4ae", fontSize: 11, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase" }}>Your collection</Typography>
                  <Typography sx={{ mt: 0.8, color: "#eef3f0", fontSize: { xs: 19, sm: 24 }, fontWeight: 750 }}>A map of what is sticking</Typography>
                </Box>
                <Typography sx={{ color: "#8e9a94", fontSize: 12, textAlign: "right", display: { xs: "none", sm: "block" } }}>Roots → trunk → canopy</Typography>
              </Box>
            </Box>

            <Box sx={{ order: { xs: 1, md: 2 }, pl: { md: 3 } }}>
              <Typography sx={{ color: "#6ec99f", fontSize: 12, fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", mb: 2 }}>Progress with shape</Typography>
              <Typography component="h2" sx={{ fontSize: "clamp(2rem, 4.4vw, 3.65rem)", lineHeight: 1.05, letterSpacing: "-0.05em", fontWeight: 740, maxWidth: 500 }}>
                Watch familiarity take root.
              </Typography>
              <Typography sx={{ mt: 3, color: "#929e98", lineHeight: 1.75, maxWidth: 500 }}>
                Shuukan’s tree is not decoration. New kanji begin at the roots, move through the trunk as recall strengthens, and reach the canopy when they become familiar.
              </Typography>
              <Box sx={{ mt: 4, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderBlock: "1px solid #27302c" }}>
                {[["Roots", "New"], ["Trunk", "Growing"], ["Canopy", "Familiar"]].map(([zone, state], index) => (
                  <Box key={zone} sx={{ py: 2.25, px: { xs: 1, sm: 2 }, borderLeft: index ? "1px solid #27302c" : "none" }}>
                    <Typography sx={{ color: "#e9eeeb", fontSize: { xs: 13, sm: 15 }, fontWeight: 750 }}>{zone}</Typography>
                    <Typography sx={{ mt: 0.5, color: "#6f7c75", fontSize: { xs: 10, sm: 12 } }}>{state}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>

        <Box component="section" sx={{ px: { xs: 2.25, sm: 4 }, pb: { xs: 9, md: 14 } }}>
          <Box sx={{ maxWidth: PAGE_WIDTH, mx: "auto", bgcolor: "#dfe9e4", color: "#0b100d", borderRadius: { xs: 4, md: 6 }, p: { xs: 3.5, sm: 6, md: 8 }, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr auto" }, alignItems: "end", gap: 4 }}>
            <Box>
              <Typography sx={{ color: "#39755b", fontSize: 11, fontWeight: 850, letterSpacing: "0.13em", textTransform: "uppercase", mb: 2 }}>Start with one thing you saw today</Typography>
              <Typography component="h2" sx={{ maxWidth: 720, fontSize: "clamp(2rem, 5vw, 4rem)", lineHeight: 1.03, letterSpacing: "-0.055em", fontWeight: 780 }}>
                Build a Japanese habit that belongs to your life.
              </Typography>
            </Box>
            <Button onClick={() => navigate("/signup")} endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 54, bgcolor: "#0d1712", color: "#eef4f0", px: 3.5, borderRadius: 2.5, textTransform: "none", fontSize: 15, fontWeight: 800, justifyContent: "space-between", "&:hover": { bgcolor: "#19291f", transform: "translateY(-1px)" }, "&:active": { transform: "scale(0.98)" } }}>
              Start collecting
            </Button>
          </Box>
        </Box>
      </Box>

      <Box component="footer" sx={{ borderTop: "1px solid #1c2521", px: { xs: 2.25, sm: 4 }, py: 4 }}>
        <Box sx={{ maxWidth: PAGE_WIDTH, mx: "auto", display: "flex", flexDirection: { xs: "column", sm: "row" }, alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between", gap: 3 }}>
          <Brand />
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <Typography component="a" href="#" sx={{ color: "#728078", fontSize: 12, textDecoration: "none", "&:hover": { color: "#b8c2bd" } }}>Privacy</Typography>
            <Typography component="a" href="#" sx={{ color: "#728078", fontSize: 12, textDecoration: "none", "&:hover": { color: "#b8c2bd" } }}>Terms</Typography>
            <Typography sx={{ color: "#56625c", fontSize: 12 }}>© 2026 Shuukan</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
