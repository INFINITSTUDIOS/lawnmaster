import "server-only";

/** Thin wrapper over the Vercel Domains API, used to attach customers' own domains. */

const API = "https://api.vercel.com";

export function vercelConfigured(): boolean {
  return Boolean(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID);
}

function url(path: string): string {
  const team = process.env.VERCEL_TEAM_ID;
  return `${API}${path}${team ? `${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(team)}` : ""}`;
}

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url(path), {
    method,
    headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const project = () => encodeURIComponent(process.env.VERCEL_PROJECT_ID ?? "");

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };

/** DNS records the company must create at their registrar for a domain. */
export function dnsRecordsFor(domain: string): DnsRecord[] {
  const isApex = domain.split(".").length === 2;
  return isApex
    ? [{ type: "A", name: "@", value: "76.76.21.21" }]
    : [{ type: "CNAME", name: domain.split(".").slice(0, -2).join("."), value: "cname.vercel-dns.com" }];
}

export type DomainStatus = { verified: boolean; error?: string; extraRecords: DnsRecord[] };

function ownershipRecords(json: Record<string, unknown>): DnsRecord[] {
  const list = (json.verification as { type: string; domain: string; value: string }[] | undefined) ?? [];
  return list.filter((v) => v.type === "TXT").map((v) => ({ type: "TXT" as const, name: v.domain, value: v.value }));
}

export async function addDomain(domain: string): Promise<DomainStatus> {
  const { status, json } = await call("POST", `/v10/projects/${project()}/domains`, { name: domain });
  if (status >= 400) {
    const err = json.error as { code?: string; message?: string } | undefined;
    if (err?.code !== "domain_already_in_use" || !String(err?.message).includes("this project")) {
      return { verified: false, error: err?.message ?? "Vercel rejected the domain.", extraRecords: [] };
    }
  }
  return checkDomain(domain);
}

/** A domain is live once Vercel has verified ownership and its DNS points at Vercel. */
export async function checkDomain(domain: string): Promise<DomainStatus> {
  const d = encodeURIComponent(domain);
  const [info, config] = await Promise.all([
    call("GET", `/v9/projects/${project()}/domains/${d}`),
    call("GET", `/v6/domains/${d}/config`),
  ]);
  if (info.status >= 400) return { verified: false, error: "Domain is not attached to the project.", extraRecords: [] };
  let owned = info.json.verified === true;
  let extraRecords = ownershipRecords(info.json);
  if (!owned) {
    const retry = await call("POST", `/v9/projects/${project()}/domains/${d}/verify`);
    owned = retry.json.verified === true;
    if (!owned && retry.status < 400) extraRecords = ownershipRecords(retry.json);
  }
  const pointed = config.status < 400 && config.json.misconfigured === false;
  return { verified: owned && pointed, extraRecords: owned ? [] : extraRecords };
}

export async function removeDomain(domain: string): Promise<void> {
  await call("DELETE", `/v9/projects/${project()}/domains/${encodeURIComponent(domain)}`);
}
