/** Hostname helpers shared by the proxy and server code. No server-only imports here. */

export function rootDomain(): string {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000").toLowerCase();
}

const RESERVED = new Set(["www", "app", "api", "admin", "dashboard", "mail", "support", "status"]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

export type HostKind =
  | { kind: "platform" }
  | { kind: "tenant-slug"; slug: string }
  | { kind: "tenant-domain"; domain: string };

/** Classify a Host header against the platform's root domain. */
export function classifyHost(hostHeader: string | null | undefined, root = rootDomain()): HostKind {
  const host = (hostHeader || "").toLowerCase().trim();
  const bare = (h: string) => h.replace(/:\d+$/, "");
  const hostName = bare(host);
  const rootName = bare(root);
  if (!hostName || hostName === rootName || hostName === `www.${rootName}`) return { kind: "platform" };
  if (hostName.endsWith(`.${rootName}`)) {
    const sub = hostName.slice(0, -rootName.length - 1);
    if (sub.includes(".") || isReservedSlug(sub)) return { kind: "platform" };
    return { kind: "tenant-slug", slug: sub };
  }
  // Vercel preview deployments and bare IPs are the platform, not a tenant.
  if (hostName.endsWith(".vercel.app") || /^[\d.]+$/.test(hostName)) return { kind: "platform" };
  return { kind: "tenant-domain", domain: hostName };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function protocol(root: string): string {
  return root.startsWith("localhost") || root.includes(".localhost") ? "http" : "https";
}

export function platformUrl(path = ""): string {
  const root = rootDomain();
  return `${protocol(root)}://${root}${path}`;
}

export function storefrontUrl(slug: string, path = ""): string {
  const root = rootDomain();
  return `${protocol(root)}://${slug}.${root}${path}`;
}

/** Validate a customer-supplied custom domain like "lawns.example.com". */
export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (d.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) return null;
  const rootName = rootDomain().replace(/:\d+$/, "");
  if (d === rootName || d.endsWith(`.${rootName}`)) return null;
  return d;
}
