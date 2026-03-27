import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { supabase } from "@/lib/supabase";

const apiUrl = import.meta.env.VITE_API_URL;

function LeafIcon({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "var(--app-height)",
        bgcolor: "#050508",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box sx={{ position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)", width: 600, height: 300, bgcolor: "rgba(16,185,129,0.1)", filter: "blur(120px)", borderRadius: "50%", pointerEvents: "none" }} />
      <Box sx={{ position: "absolute", top: "50%", right: "20%", width: 300, height: 300, bgcolor: "rgba(67,56,202,0.1)", filter: "blur(120px)", borderRadius: "50%", pointerEvents: "none" }} />

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 5, position: "relative", zIndex: 1 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, background: "linear-gradient(135deg, #34d399, #4338ca)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LeafIcon size={24} />
        </Box>
        <Typography sx={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: "white" }}>Shuukan</Typography>
      </Box>

      <Box sx={{ position: "relative", zIndex: 1, width: "100%", display: "flex", justifyContent: "center" }}>
        {children}
      </Box>
    </Box>
  );
}

export default function Signup() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [success, setSuccess] = useState(false);
  const [inviteValid, setInviteValid] = useState(false);

  useEffect(() => {
    if (!inviteCode) {
      setChecking(false);
      return;
    }

    fetch(`${apiUrl}/api/invite/${inviteCode}/details`)
      .then((res) => {
        if (!res.ok) throw new Error("Invalid invite");
        return res.json();
      })
      .then((data: { email: string; status: string }) => {
        if (data.status !== "PENDING") {
          setError("This invite has already been used or revoked.");
        } else {
          setEmail(data.email);
          setInviteValid(true);
        }
      })
      .catch(() => setError("Invalid or expired invite link."))
      .finally(() => setChecking(false));
  }, [inviteCode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!birthDate) {
      setError("Please enter your date of birth.");
      return;
    }
    if (new Date(birthDate) >= new Date()) {
      setError("Date of birth must be in the past.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      try { localStorage.setItem("pending_birth_date", birthDate); } catch { /* ignore */ }
      setSuccess(true);
    }
    setLoading(false);
  };

  if (checking) {
    return (
      <PageShell>
        <CircularProgress sx={{ color: "#34d399" }} />
      </PageShell>
    );
  }

  if (!inviteCode) {
    return (
      <PageShell>
        <Box sx={{ textAlign: "center", px: 3 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: "white", mb: 1.5 }}>No invite code provided</Typography>
          <Typography sx={{ fontSize: 13, color: "grey.500", mb: 3 }}>
            You need an invite link to sign up.
          </Typography>
          <Button
            component={Link}
            to="/login"
            sx={{
              color: "#34d399", borderColor: "#34d399", textTransform: "none", fontWeight: 600,
              "&:hover": { borderColor: "#10b981", bgcolor: "rgba(16,185,129,0.1)" },
            }}
            variant="outlined"
          >
            Back to Login
          </Button>
        </Box>
      </PageShell>
    );
  }

  if (success) {
    return (
      <PageShell>
        <Box sx={{ textAlign: "center", px: 3, maxWidth: 380 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: "white", mb: 1.5 }}>Check your email</Typography>
          <Typography sx={{ fontSize: 13, color: "grey.500", mb: 3 }}>
            We sent a confirmation link to <strong style={{ color: "white" }}>{email}</strong>.
            Click the link to activate your account.
          </Typography>
          <Button
            component={Link}
            to="/login"
            sx={{
              color: "#34d399", borderColor: "#34d399", textTransform: "none", fontWeight: 600,
              "&:hover": { borderColor: "#10b981", bgcolor: "rgba(16,185,129,0.1)" },
            }}
            variant="outlined"
          >
            Back to Login
          </Button>
        </Box>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: "100%", maxWidth: 380, px: 4, py: 5, mx: 3,
          bgcolor: "rgba(15,15,22,0.8)", backdropFilter: "blur(12px)",
          border: "1px solid", borderColor: "grey.800",
          borderRadius: 4,
        }}
      >
        <Typography sx={{ fontSize: 22, fontWeight: 700, color: "white", textAlign: "center", mb: 0.5 }}>
          Join Shuukan
        </Typography>
        <Typography sx={{ fontSize: 13, color: "grey.500", textAlign: "center", mb: 3 }}>
          Create your account to start learning
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
          slotProps={{ input: { readOnly: true } }}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Password"
          type="password"
          fullWidth
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 2 }}
          disabled={!inviteValid}
        />
        <TextField
          label="Confirm Password"
          type="password"
          fullWidth
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          sx={{ mb: 2 }}
          disabled={!inviteValid}
        />
        <TextField
          label="Date of Birth"
          type="date"
          fullWidth
          required
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ mb: 3 }}
          disabled={!inviteValid}
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={loading || !inviteValid}
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
          {loading ? "Creating account..." : "Sign Up"}
        </Button>
        <Typography sx={{ mt: 2.5, textAlign: "center", fontSize: 13, color: "grey.500" }}>
          Already have an account?{" "}
          <Box component={Link} to="/login" sx={{ color: "#34d399", textDecoration: "none", fontWeight: 600, "&:hover": { textDecoration: "underline" } }}>
            Sign in
          </Box>
        </Typography>
      </Box>
    </PageShell>
  );
}