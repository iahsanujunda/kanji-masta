import { supabase } from "@/lib/supabase";

const apiUrl = import.meta.env.VITE_API_URL;

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      throw new Error("Access denied. Your invite may be invalid or revoked.");
    }
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
