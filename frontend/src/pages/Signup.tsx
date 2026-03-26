import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { supabase } from "@/lib/supabase";

const apiUrl = import.meta.env.VITE_API_URL;

export default function Signup() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (checking) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!inviteCode) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box sx={{ textAlign: "center", px: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>No invite code provided</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            You need an invite link to sign up.
          </Typography>
          <Button component={Link} to="/login" variant="outlined">
            Back to Login
          </Button>
        </Box>
      </Box>
    );
  }

  if (success) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Box sx={{ textAlign: "center", px: 3, maxWidth: 360 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Check your email</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            We sent a confirmation link to <strong>{email}</strong>.
            Click the link to activate your account.
          </Typography>
          <Button component={Link} to="/login" variant="outlined">
            Back to Login
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ width: "100%", maxWidth: 360, px: 3, py: 4, bgcolor: "#4338ca", borderRadius: 4 }}
      >
        <Typography variant="h5" sx={{ mb: 3, textAlign: "center" }}>
          Join Kanji Masta
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
            bgcolor: "grey.100",
            color: "#4338ca",
            py: 1.5,
            borderRadius: 6,
            fontSize: "1rem",
            fontWeight: "bold",
            letterSpacing: 0.5,
            "&:hover": { bgcolor: "grey.300" },
          }}
        >
          {loading ? "Creating account..." : "Sign Up"}
        </Button>
        <Typography variant="body2" sx={{ mt: 2, textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
          Already have an account?{" "}
          <Box component={Link} to="/login" sx={{ color: "white" }}>
            Sign in
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}
