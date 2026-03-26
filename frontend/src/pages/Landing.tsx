import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SpaIcon from "@mui/icons-material/Spa";
import CheckIcon from "@mui/icons-material/Check";
import StarOutlineIcon from "@mui/icons-material/StarOutline";

// --- Phone Screen Mockups ---

function HomeScreen() {
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", pt: 5, pb: 2.5, px: 2, background: "linear-gradient(to bottom, #1a1a24, #0a0a0f)" }}>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 10, color: "grey.600" }}>Good morning</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>Yuki</Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <Box sx={{ bgcolor: "rgba(249,115,22,0.2)", color: "#fb923c", fontSize: 10, fontWeight: 700, px: 1, py: 0.5, borderRadius: "9999px" }}>7 day streak</Box>
      </Box>
      <Box sx={{ bgcolor: "rgba(67,56,202,0.2)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 3, p: 1.5, mb: 1.5 }}>
        <Typography sx={{ fontSize: 10, color: "#a5b4fc", fontWeight: 700, mb: 0.5 }}>Daily Quiz</Typography>
        <Typography sx={{ fontSize: 12, color: "white", fontWeight: 700 }}>5 quizzes ready</Typography>
        <Box sx={{ width: "100%", bgcolor: "grey.800", borderRadius: "9999px", height: 5, mt: 1 }}>
          <Box sx={{ bgcolor: "#6366f1", height: 5, borderRadius: "9999px", width: "0%" }} />
        </Box>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 1.5 }}>
        <Box sx={{ bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 2, p: 1.5 }}>
          <Typography sx={{ fontSize: 10, color: "grey.600" }}>Kanji</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>42</Typography>
          <Typography sx={{ fontSize: 9, color: "#34d399" }}>28 learning</Typography>
        </Box>
        <Box sx={{ bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 2, p: 1.5 }}>
          <Typography sx={{ fontSize: 10, color: "grey.600" }}>Words</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>87</Typography>
          <Typography sx={{ fontSize: 9, color: "#818cf8" }}>12 new</Typography>
        </Box>
      </Box>
      <Box sx={{ mt: "auto" }}>
        <Box sx={{ width: "100%", bgcolor: "grey.100", color: "black", borderRadius: 3, py: 1.5, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <CameraAltIcon sx={{ fontSize: 14 }} /> Capture Kanji
        </Box>
      </Box>
    </Box>
  );
}

function CollectionScreen() {
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", pt: 5, pb: 2.5, px: 2, background: "linear-gradient(to bottom, #1a1a24, #0a0a0f)" }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>Your Tree</Typography>
        <Typography sx={{ fontSize: 10, color: "#34d399" }}>42 kanji growing</Typography>
      </Box>
      <Box sx={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 200 280" style={{ width: "100%", height: "100%" }}>
          <polygon points="92,260 88,160 112,160 108,260" fill="#754127" />
          <polygon points="95,180 85,160 115,160 105,180" fill="#8B5E3C" />
          <ellipse cx="100" cy="265" rx="45" ry="12" fill="#6b21a8" opacity="0.3" />
          <polygon points="40,170 100,70 160,170" fill="#2d4a1b" />
          <polygon points="55,140 100,50 145,140" fill="#3a6024" />
          <polygon points="65,110 100,30 135,110" fill="#4a7a2e" />
          <circle cx="100" cy="50" r="3" fill="#a8e870"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" /></circle>
          <circle cx="75" cy="120" r="3" fill="#a8e870"><animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="0.5s" repeatCount="indefinite" /></circle>
          <circle cx="125" cy="130" r="3" fill="#a8e870"><animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="1s" repeatCount="indefinite" /></circle>
          <circle cx="90" cy="90" r="2.5" fill="#818cf8"><animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="0.3s" repeatCount="indefinite" /></circle>
          <circle cx="110" cy="100" r="2.5" fill="#818cf8"><animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="0.7s" repeatCount="indefinite" /></circle>
        </svg>
        <Box sx={{ position: "absolute", top: 16, right: 8, bgcolor: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 1.5, px: 1, py: 0.5 }}>
          <Typography sx={{ fontSize: 8, color: "#34d399", fontWeight: 700 }}>Canopy 8</Typography>
        </Box>
        <Box sx={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", bgcolor: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 1.5, px: 1, py: 0.5 }}>
          <Typography sx={{ fontSize: 8, color: "#818cf8", fontWeight: 700 }}>Trunk 22</Typography>
        </Box>
        <Box sx={{ position: "absolute", bottom: 24, right: 8, bgcolor: "rgba(147,51,234,0.2)", border: "1px solid rgba(147,51,234,0.3)", borderRadius: 1.5, px: 1, py: 0.5 }}>
          <Typography sx={{ fontSize: 8, color: "#a78bfa", fontWeight: 700 }}>Roots 12</Typography>
        </Box>
      </Box>
    </Box>
  );
}

function CaptureScreen() {
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", pt: 5, pb: 2.5, px: 2, background: "linear-gradient(to bottom, #1a1a24, #0a0a0f)" }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: "white" }}>Found Kanji</Typography>
        <Typography sx={{ fontSize: 10, color: "grey.500" }}>3 detected</Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1.5 }}>
        {/* Kanji card */}
        <Box sx={{ bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 2, p: 1.5, position: "relative" }}>
          <Box sx={{ position: "absolute", top: 0, right: 0, bgcolor: "#4338ca", px: 1, py: 0.25, borderBottomLeftRadius: 8 }}>
            <Typography sx={{ fontSize: 7, color: "white", fontWeight: 700 }}>Recommended</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, mb: 1.5 }}>
            <Box sx={{ bgcolor: "grey.900", border: "1px solid", borderColor: "grey.800", borderRadius: 1.5, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Typography sx={{ fontSize: 28 }}>電</Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <Typography sx={{ fontSize: 9, color: "#818cf8", fontWeight: 700, letterSpacing: 1 }}>デン</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "white" }}>Electricity</Typography>
              <Box sx={{ bgcolor: "rgba(0,0,0,0.3)", border: "1px solid", borderColor: "grey.800", borderRadius: 0.5, px: 0.75, py: 0.25, mt: 0.25, display: "inline-block" }}>
                <Typography component="span" sx={{ fontSize: 9, color: "grey.400" }}>電車 </Typography>
                <Typography component="span" sx={{ fontSize: 8, color: "grey.600" }}>(train)</Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Box sx={{ flex: 1, bgcolor: "grey.900", border: "2px solid transparent", color: "grey.500", borderRadius: 1.5, py: 1, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
              <CheckIcon sx={{ fontSize: 12 }} /> Already Know
            </Box>
            <Box sx={{ flex: 1, bgcolor: "#4338ca", border: "2px solid #818cf8", color: "white", borderRadius: 1.5, py: 1, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, boxShadow: "0 0 10px rgba(79,70,229,0.4)" }}>
              <StarOutlineIcon sx={{ fontSize: 12 }} /> Want to Learn
            </Box>
          </Box>
        </Box>
        {/* Second card peek */}
        <Box sx={{ bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 2, p: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <Box sx={{ bgcolor: "grey.900", border: "1px solid", borderColor: "grey.800", borderRadius: 1.5, width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Typography sx={{ fontSize: 28 }}>車</Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <Typography sx={{ fontSize: 9, color: "#818cf8", fontWeight: 700, letterSpacing: 1 }}>シャ</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: "white" }}>Vehicle</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function QuizScreen() {
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", pt: 5, pb: 2.5, px: 2, background: "linear-gradient(to bottom, #1a1a24, #0a0a0f)" }}>
      <Box sx={{ width: "100%", bgcolor: "grey.800", borderRadius: "9999px", height: 5, mb: 3 }}>
        <Box sx={{ bgcolor: "#6366f1", height: 5, borderRadius: "9999px", width: "40%" }} />
      </Box>
      <Typography sx={{ fontSize: 10, color: "grey.600", mb: 0.5, textAlign: "center" }}>What does this word mean?</Typography>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <Typography sx={{ fontSize: 28, fontWeight: 700, color: "white", mb: 0.5 }}>電車</Typography>
        <Typography sx={{ fontSize: 12, color: "#818cf8" }}>でんしゃ</Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, flex: 1 }}>
        {["Electricity", "Train", "Lightning", "Battery"].map((opt, i) => (
          <Box
            key={opt}
            sx={{
              width: "100%",
              bgcolor: i === 1 ? "rgba(67,56,202,0.2)" : "#0f0f16",
              border: i === 1 ? "2px solid #6366f1" : "1px solid",
              borderColor: i === 1 ? "#6366f1" : "grey.800",
              borderRadius: 2,
              p: 1.5,
              fontSize: 12,
              color: i === 1 ? "white" : "grey.400",
              fontWeight: i === 1 ? 600 : 400,
            }}
          >
            {opt}
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 10, color: "grey.600" }}>2 of 5</Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {[true, true, false, false, false].map((done, i) => (
            <Box key={i} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: done ? "#34d399" : "grey.800" }} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

const SCREENS = [
  { component: HomeScreen, label: "Home" },
  { component: CollectionScreen, label: "Collection" },
  { component: CaptureScreen, label: "Capture" },
  { component: QuizScreen, label: "Quiz" },
];

function PhoneCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % SCREENS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box sx={{ position: "relative", mx: "auto", width: "100%", maxWidth: { xs: 280, lg: 340 } }}>
      {/* Phone frame */}
      <Box sx={{ position: "relative", borderRadius: "2.5rem", bgcolor: "#0a0a0f", border: "6px solid", borderColor: "grey.800", boxShadow: 24, overflow: "hidden", aspectRatio: "9/19", zIndex: 1 }}>
        {SCREENS.map(({ component: Screen }, i) => (
          <Box key={i} sx={{ position: "absolute", inset: 0, transition: "opacity 0.7s", opacity: active === i ? 1 : 0, pointerEvents: active === i ? "auto" : "none" }}>
            <Screen />
          </Box>
        ))}
      </Box>

      {/* Dot indicators */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mt: 3 }}>
        {SCREENS.map(({ label }, i) => (
          <Box
            key={i}
            component="button"
            onClick={() => setActive(i)}
            title={label}
            sx={{
              transition: "all 0.3s",
              borderRadius: "9999px",
              border: "none",
              cursor: "pointer",
              width: active === i ? 32 : 10,
              height: 10,
              bgcolor: active === i ? "#34d399" : "grey.800",
              "&:hover": { bgcolor: active === i ? "#34d399" : "grey.700" },
            }}
          />
        ))}
      </Box>
      <Typography sx={{ textAlign: "center", fontSize: 11, color: "grey.600", mt: 1, fontWeight: 500 }}>{SCREENS[active].label}</Typography>
    </Box>
  );
}

// --- Feature Card ---

const FEATURES = [
  {
    icon: <CameraAltIcon sx={{ fontSize: 28, color: "#818cf8" }} />,
    iconBg: "rgba(99,102,241,0.1)",
    title: "1. Text-Based Camera",
    desc: "See a word you don't know? Snap it. Our AI extracts the characters, translates the context, and creates a learning card instantly.",
  },
  {
    icon: <PsychologyIcon sx={{ fontSize: 28, color: "#34d399" }} />,
    iconBg: "rgba(16,185,129,0.1)",
    title: "2. Frictionless Triage",
    desc: 'A rapid-fire swipe interface lets you instantly categorize new words as "Already Know" or "Want to Learn" without overthinking it.',
  },
  {
    icon: <SpaIcon sx={{ fontSize: 28, color: "#a78bfa" }} />,
    iconBg: "rgba(147,51,234,0.1)",
    title: "3. Grow Your Ecosystem",
    desc: "Watch your vocabulary physically grow. Words move from seeds in the roots, up the trunk, to glowing fruits in the canopy as you master them.",
  },
];

// --- Main Landing Page ---

export default function Landing() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#050508", color: "grey.100", overflowX: "hidden" }}>

      {/* Navbar */}
      <Box
        component="nav"
        sx={{
          position: "fixed", top: 0, width: "100%", zIndex: 50,
          bgcolor: "rgba(5,5,8,0.8)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid", borderColor: "rgba(75,85,99,0.5)",
        }}
      >
        <Box sx={{ maxWidth: 1152, mx: "auto", px: 3, height: 80, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, background: "linear-gradient(135deg, #34d399, #4338ca)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SpaIcon sx={{ fontSize: 20, color: "white" }} />
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: "white" }}>Shuukan</Typography>
          </Box>
          {/* Mobile nav */}
          <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", gap: 1 }}>
            <Button onClick={() => navigate("/login")} size="small" sx={{ color: "grey.400", textTransform: "none", fontWeight: 500, fontSize: 13, minWidth: 0 }}>
              Log In
            </Button>
            <Button
              onClick={() => navigate("/signup")}
              size="small"
              sx={{
                bgcolor: "white", color: "black", px: 2, py: 0.75, borderRadius: "9999px",
                textTransform: "none", fontWeight: 600, fontSize: 12,
                "&:hover": { bgcolor: "grey.200" },
              }}
            >
              Sign Up
            </Button>
          </Box>
          {/* Desktop nav */}
          <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 4 }}>
            <Button onClick={() => navigate("/login")} sx={{ color: "white", textTransform: "none", fontWeight: 500, "&:hover": { color: "#34d399" } }}>
              Log In
            </Button>
            <Button
              onClick={() => navigate("/signup")}
              sx={{
                bgcolor: "white", color: "black", px: 2.5, py: 1, borderRadius: "9999px",
                textTransform: "none", fontWeight: 600,
                "&:hover": { bgcolor: "grey.200" },
              }}
            >
              Get Early Access
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Hero */}
      <Box component="section" sx={{ position: "relative", pt: { xs: 20, lg: 24 }, pb: { xs: 10, lg: 16 }, px: 3 }}>
        {/* Glows */}
        <Box sx={{ position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)", width: 800, height: 400, bgcolor: "rgba(16,185,129,0.15)", filter: "blur(120px)", borderRadius: "50%", pointerEvents: "none" }} />
        <Box sx={{ position: "absolute", top: 160, right: 0, width: 400, height: 400, bgcolor: "rgba(67,56,202,0.15)", filter: "blur(120px)", borderRadius: "50%", pointerEvents: "none" }} />

        <Box sx={{ maxWidth: 1152, mx: "auto", display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: { xs: 6, lg: 4 }, alignItems: "center", position: "relative", zIndex: 1 }}>
          {/* Copy */}
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75, borderRadius: "9999px", bgcolor: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#a5b4fc", fontSize: 13, fontWeight: 700, mb: 3 }}>
              <AutoAwesomeIcon sx={{ fontSize: 16 }} /> The Anti-Anki App
            </Box>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: 40, lg: 56 }, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, mb: 3,
                background: "linear-gradient(to bottom, white, #9ca3af)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}
            >
              Don't study Japanese.{" "}
              <Box component="br" sx={{ display: { xs: "none", sm: "block" } }} />
              <Box component="span" sx={{ WebkitTextFillColor: "#34d399" }}>Live it.</Box>
            </Typography>
            <Typography sx={{ fontSize: { xs: 16, lg: 18 }, color: "grey.500", lineHeight: 1.7, mb: 5, maxWidth: 520 }}>
              Snap photos of menus, signs, and screens. Shuukan extracts the characters, tests your recall in bite-sized daily slots, and grows your personal language ecosystem.
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button
                onClick={() => navigate("/signup")}
                sx={{
                  bgcolor: "#10b981", color: "black", fontSize: 16, fontWeight: 700, px: 4, py: 2, borderRadius: "9999px",
                  textTransform: "none",
                  boxShadow: "0 0 30px rgba(16,185,129,0.3)",
                  "&:hover": { bgcolor: "#34d399" },
                }}
              >
                Get Early Access
              </Button>
              <Typography sx={{ fontSize: 14, color: "grey.600" }}>
                or{" "}
                <Box
                  component="span"
                  onClick={() => navigate("/login")}
                  sx={{ color: "grey.400", cursor: "pointer", textDecoration: "underline", "&:hover": { color: "white" } }}
                >
                  Log In
                </Box>
              </Typography>
            </Box>
            <Typography sx={{ mt: 2, fontSize: 11, color: "grey.600", fontWeight: 500 }}>Free forever for early adopters. No hidden subscriptions.</Typography>
          </Box>

          {/* Phone */}
          <PhoneCarousel />
        </Box>
      </Box>

      {/* Features Grid */}
      <Box component="section" sx={{ py: { xs: 10, lg: 12 }, bgcolor: "#0a0a0f", borderTop: "1px solid", borderColor: "grey.900" }}>
        <Box sx={{ maxWidth: 1152, mx: "auto", px: 3 }}>
          <Box sx={{ textAlign: "center", mb: 8 }}>
            <Typography sx={{ fontSize: { xs: 24, lg: 40 }, fontWeight: 700, color: "white", mb: 2 }}>A workflow built for real life.</Typography>
            <Typography sx={{ color: "grey.500", maxWidth: 640, mx: "auto", fontSize: { xs: 14, lg: 16 } }}>No spreadsheets. No massive flashcard decks. Shuukan turns the world around you into a personalized curriculum.</Typography>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 3 }}>
            {FEATURES.map((f) => (
              <Box key={f.title} sx={{ bgcolor: "#0f0f16", border: "1px solid", borderColor: "grey.800", borderRadius: 4, p: 4, "&:hover": { bgcolor: "#14141e" }, transition: "background-color 0.2s" }}>
                <Box sx={{ width: 56, height: 56, bgcolor: f.iconBg, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", mb: 3 }}>
                  {f.icon}
                </Box>
                <Typography sx={{ fontSize: 18, fontWeight: 700, color: "white", mb: 1.5 }}>{f.title}</Typography>
                <Typography sx={{ color: "grey.500", lineHeight: 1.7, fontSize: 13 }}>{f.desc}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Footer CTA */}
      <Box component="footer" sx={{ borderTop: "1px solid", borderColor: "grey.900", bgcolor: "#050508", pt: 10, pb: 5, px: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: { xs: 24, lg: 32 }, fontWeight: 700, color: "white", mb: 3 }}>Ready to plant your first seed?</Typography>
        <Button
          onClick={() => navigate("/signup")}
          sx={{
            bgcolor: "white", color: "black", fontSize: 16, fontWeight: 700, px: 5, py: 2, borderRadius: "9999px",
            textTransform: "none", mb: 8,
            "&:hover": { bgcolor: "grey.200" },
          }}
        >
          Get Early Access
        </Button>
        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: "center", justifyContent: "space-between", maxWidth: 1152, mx: "auto", pt: 4, borderTop: "1px solid", borderColor: "grey.900" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: { xs: 2, md: 0 } }}>
            <SpaIcon sx={{ fontSize: 16, color: "grey.700" }} />
            <Typography sx={{ fontSize: 12, color: "grey.600", fontWeight: 500 }}>&copy; 2026 Shuukan App. All rights reserved.</Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 3 }}>
            {["Privacy", "Terms", "Twitter"].map((link) => (
              <Typography key={link} component="a" href="#" sx={{ fontSize: 12, color: "grey.600", fontWeight: 500, textDecoration: "none", "&:hover": { color: "grey.300" } }}>
                {link}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
