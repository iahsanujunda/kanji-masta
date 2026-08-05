import { useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AdminBottomDrawer from "@/pages/admin/AdminBottomDrawer";
import { adminApi } from "@/pages/admin/api";
import { useAuth } from "@/hooks/useAuth";

export default function InvitesTab() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const invites = useQuery({ queryKey: ["admin-invites", userId], queryFn: ({ signal }) => adminApi.invites(signal), enabled: Boolean(user) });
  const create = useMutation({
    mutationFn: () => adminApi.createInvite(email.trim(), sendEmail),
    onSuccess: async () => { setOpen(false); setEmail(""); await queryClient.invalidateQueries({ queryKey: ["admin-invites", userId] }); },
  });
  const revoke = useMutation({
    mutationFn: adminApi.revokeInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-invites", userId] }),
  });
  return <Box sx={{ display: "grid", gap: 1.5 }}>
    <Button onClick={() => setOpen(true)} sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", textTransform: "none", fontWeight: 900 }}>Create invite</Button>
    {invites.isError && <Alert severity="error" action={<Button onClick={() => invites.refetch()}>Retry</Button>}>Invites are unavailable.</Alert>}
    {invites.data?.invites.length === 0 && <Box sx={{ bgcolor: "#0f0f16", border: "1px solid #242431", borderRadius: 3, p: 3 }}><Typography color="grey.500">No invites yet.</Typography></Box>}
    {invites.data?.invites.map((invite) => <Box key={invite.id} sx={{ bgcolor: "#0f0f16", border: "1px solid #242431", borderRadius: 3, p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}><Typography sx={{ color: "grey.100", fontWeight: 750, overflowWrap: "anywhere" }}>{invite.email}</Typography><Typography sx={{ color: invite.status === "PENDING" ? "#818cf8" : "#34d399", fontSize: 11, fontWeight: 800 }}>{invite.status}</Typography></Box>
      <Typography sx={{ color: "grey.600", fontSize: 11, mt: .5 }}>{new Date(invite.createdAt).toLocaleDateString()}</Typography>
      {invite.status === "PENDING" && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1.5 }}>
        <Button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/signup?invite=${invite.code}`)} sx={{ minHeight: 44, color: "#34d399", border: "1px solid rgba(52,211,153,.35)", textTransform: "none" }}>Copy link</Button>
        <Button onClick={() => revoke.mutate(invite.id)} sx={{ minHeight: 44, color: "#f87171", border: "1px solid rgba(248,113,113,.35)", textTransform: "none" }}>Revoke</Button>
      </Box>}
    </Box>)}
    <AdminBottomDrawer open={open} title="Create invite" onClose={() => setOpen(false)} submitting={create.isPending}>
      <TextField autoFocus fullWidth label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} sx={{ mt: .5 }} />
      <FormControlLabel control={<Checkbox checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />} label="Send invite email" sx={{ my: 1, color: "grey.400" }} />
      {create.isError && <Alert severity="error" sx={{ mb: 1 }}>Invite creation failed.</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <Button disabled={create.isPending} onClick={() => setOpen(false)} sx={{ minHeight: 48, bgcolor: "#1a1a24", color: "grey.200", textTransform: "none" }}>Cancel</Button>
        <Button disabled={create.isPending || !email.trim()} onClick={() => create.mutate()} sx={{ minHeight: 48, bgcolor: "#10b981", color: "#050508", fontWeight: 900, textTransform: "none" }}>Create</Button>
      </Box>
    </AdminBottomDrawer>
  </Box>;
}
