import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";

export function useSignedPhotoUrl(storagePath?: string | null) {
  const { user } = useAuth();
  const normalizedPath = storagePath ?? undefined;
  return useQuery({
    queryKey: queryKeys.signedPhoto(user?.id ?? "", normalizedPath),
    enabled: Boolean(user && normalizedPath),
    staleTime: 4 * 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("photos").createSignedUrl(normalizedPath!, 300);
      if (error || !data?.signedUrl) throw error ?? new Error("Could not load photo preview");
      return data.signedUrl;
    },
  });
}
