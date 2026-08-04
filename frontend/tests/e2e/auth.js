const userId = "e2e00000-0000-4000-8000-000000000001";
const expiresAt = 4_102_444_800;

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const accessToken = [
  encodeJwtPart({ alg: "HS256", typ: "JWT" }),
  encodeJwtPart({
    aud: "authenticated",
    email: "learner@example.test",
    exp: expiresAt,
    role: "authenticated",
    sub: userId,
  }),
  "e2e-signature",
].join(".");

const session = {
  access_token: accessToken,
  expires_at: expiresAt,
  expires_in: expiresAt,
  refresh_token: "e2e-refresh-token",
  token_type: "bearer",
  user: {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "learner@example.test",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    phone: "",
    confirmed_at: "2026-01-01T00:00:00.000Z",
    last_sign_in_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: "E2E Learner" },
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    is_anonymous: false,
  },
};

export async function authenticate(page) {
  await page.addInitScript(
    ({ storageKey, storedSession }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(storedSession));
    },
    {
      storageKey: "sb-127-auth-token",
      storedSession: session,
    },
  );
}
