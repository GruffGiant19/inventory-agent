import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // Guard against placeholder values at build time
  if (!url.startsWith("http")) {
    // Return a dummy that will never be called in a real browser session
    return createBrowserClient("https://placeholder.supabase.co", key || "placeholder");
  }

  return createBrowserClient(url, key);
}
