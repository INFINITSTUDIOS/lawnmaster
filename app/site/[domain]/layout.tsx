import type { Metadata } from "next";
import Link from "next/link";
import { LeafIcon } from "@/components/Logo";
import { getUser } from "@/lib/auth";
import { getTenant, requireTenant } from "@/lib/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getTenant();
  if (!company) return { title: "Not found" };
  return { title: `${company.name} — Lawn care`, description: company.tagline ?? `Sign up for lawn mowing with ${company.name}.` };
}

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const company = await requireTenant();
  const user = await getUser();
  return (
    <div className="flex min-h-screen flex-col" style={{ "--brand": company.brand_color } as React.CSSProperties}>
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex min-w-0 items-center gap-2 text-lg font-bold text-brand-dark">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- company-supplied logo from any host
              <img src={company.logo_url} alt="" className="h-9 w-auto max-w-[8rem] object-contain" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white"><LeafIcon className="h-5 w-5" /></span>
            )}
            <span className="truncate">{company.name}</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2">
            {user ? (
              <Link href="/account" className="btn-outline">My account</Link>
            ) : (
              <>
                <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:text-brand sm:block">Log in</Link>
                <Link href="/signup" className="btn">Get started</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-100 py-6 text-center text-sm text-gray-500">
        <p>
          {company.name}
          {company.phone && <> · <a href={`tel:${company.phone}`} className="hover:underline">{company.phone}</a></>}
        </p>
        <p className="mt-1 text-xs">Powered by LawnMaster</p>
      </footer>
    </div>
  );
}
