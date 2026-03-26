import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import { supabase } from "@/lib/supabase";

function LeafIcon({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#050508",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glows */}
      <Box sx={{ position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)", width: 600, height: 300, bgcolor: "rgba(16,185,129,0.1)", filter: "blur(120px)", borderRadius: "50%", pointerEvents: "none" }} />
      <Box sx={{ position: "absolute", top: "50%", right: "20%", width: 300, height: 300, bgcolor: "rgba(67,56,202,0.1)", filter: "blur(120px)", borderRadius: "50%", pointerEvents: "none" }} />

      {/* Logo */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 5, position: "relative", zIndex: 1 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, background: "linear-gradient(135deg, #34d399, #4338ca)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LeafIcon size={24} />
        </Box>
        <Typography sx={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: "white" }}>Shuukan</Typography>
      </Box>

      {/* Form card */}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: "100%", maxWidth: 380, px: 4, py: 5,
          bgcolor: "rgba(15,15,22,0.8)", backdropFilter: "blur(12px)",
          border: "1px solid", borderColor: "grey.800",
          borderRadius: 4, position: "relative", zIndex: 1,
        }}
      >
        <Typography sx={{ fontSize: 22, fontWeight: 700, color: "white", textAlign: "center", mb: 0.5 }}>
          Welcome back
        </Typography>
        <Typography sx={{ fontSize: 13, color: "grey.500", textAlign: "center", mb: 3 }}>
          Sign in to continue learning
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Email"
          type="email"
          fullWidth
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Password"
          type="password"
          fullWidth
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 3 }}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={loading}
          sx={{
            bgcolor: "#10b981",
            color: "black",
            py: 1.5,
            borderRadius: "9999px",
            fontSize: "1rem",
            fontWeight: 700,
            textTransform: "none",
            boxShadow: "0 0 20px rgba(16,185,129,0.2)",
            "&:hover": { bgcolor: "#34d399" },
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </Button>
        <Typography sx={{ mt: 2.5, textAlign: "center", fontSize: 13, color: "grey.500" }}>
          Have an invite?{" "}
          <Box component={Link} to="/signup" sx={{ color: "#34d399", textDecoration: "none", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}>
            Sign up
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}