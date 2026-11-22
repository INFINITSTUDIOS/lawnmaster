import Link from "next/link";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireCompany } from "@/lib/auth";
import type { ServiceArea } from "@/lib/types";
import { AreaForm } from "../AreaForm";

export default async function NewAreaPage({ searchParams }: { searchParams: Search }) {
  const { company, supabase } = await requireCompany();
  const msg = await readNotice(searchParams);
  const { data: areas } = await supabase.from("service_areas").select("name, boundary").eq("company_id", company.id);
  const center: [number, number] | null = company.map_center_lng !== null && company.map_center_lat !== null ? [company.map_center_lng, company.map_center_lat] : null;
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/dashboard/areas" className="text-brand hover:underline">← Service areas</Link></p>
      <PageHeader title="New service area" subtitle="Outline a neighborhood you serve. Only addresses inside it can sign up." />
      <Notice {...msg} />
      <AreaForm area={null} others={(areas ?? []) as Pick<ServiceArea, "name" | "boundary">[]} center={center} />
    </>
  );
}
