import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireCompany } from "@/lib/auth";
import { storefrontUrl } from "@/lib/hosts";
import { logOut } from "../(platform)/actions";

export const metadata = { title: "Dashboard · LawnMaster" };

const NAV = [
  ["/dashboard", "Overview"],
  ["/dashboard/schedule", "Schedule"],
  ["/dashboard/customers", "Customers"],
  ["/dashboard/areas", "Service areas"],
  ["/dashboard/pricing", "Lawn sizes"],
  ["/dashboard/services", "Extra services"],
  ["/dashboard/settings", "Settings"],
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { company, user } = await requireCompany();
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      <aside className="border-b border-gray-200 bg-white md:w-60 md:border-b-0 md:border-r">
        <div className="px-4 py-4"><Link href="/dashboard"><Logo /></Link></div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-brand-soft hover:text-brand-dark">
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden px-4 py-4 text-sm md:block">
          <p className="font-semibold text-gray-900">{company.name}</p>
          <a href={storefrontUrl(company.slug)} target="_blank" rel="noreferrer" className="text-brand hover:underline">View customer site ↗</a>
          <p className="mt-3 truncate text-xs text-gray-500">{user.email}</p>
          <form action={logOut}><button className="mt-1 text-xs text-gray-600 underline">Log out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
