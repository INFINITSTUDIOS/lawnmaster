import Link from "next/link";
import { Empty, PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { requireCompany } from "@/lib/auth";
import { formatMoney } from "@/lib/pricing";
import { FREQUENCY_LABEL, type Frequency } from "@/lib/types";

type Row = {
  id: string;
  full_name: string;
  address: string;
  service_areas: { name: string } | null;
  subscriptions: { status: string; frequency: Frequency; price_cents: number; created_at: string }[];
};

const RANK: Record<string, number> = { active: 0, past_due: 1, pending: 2, canceled: 3 };

export default async function CustomersPage() {
  const { company, supabase } = await requireCompany();
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, address, service_areas(name), subscriptions(status, frequency, price_cents, created_at)")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <PageHeader title="Customers" subtitle={`${rows.length} total`} />
      {rows.length === 0 ? (
        <Empty>No customers yet. Share your sign-up link to get your first one.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const sub = [...c.subscriptions].sort((a, b) => RANK[a.status] - RANK[b.status] || b.created_at.localeCompare(a.created_at))[0];
                return (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/customers/${c.id}`} className="font-medium text-gray-900 hover:underline">{c.full_name}</Link>
                      <p className="text-gray-600">{c.address}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.service_areas?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{sub && sub.status !== "canceled" ? `${FREQUENCY_LABEL[sub.frequency]} · ${formatMoney(sub.price_cents)}` : "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={sub?.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
