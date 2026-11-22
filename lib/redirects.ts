import { redirect } from "next/navigation";

/** Redirect back to a page with a message for <Notice />. */
export function back(path: string, kind: "error" | "notice", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
