import { redirect } from "next/navigation";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { getUser } from "@/lib/auth";
import { rootDomain, slugify } from "@/lib/hosts";
import { createClient } from "@/lib/supabase/server";
import { createCompany } from "../actions";

export const metadata = { title: "Set up your company · LawnMaster" };

export default async function OnboardingPage({ searchParams }: { searchParams: Search }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: membership } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).limit(1).maybeSingle();
  if (membership) redirect("/dashboard");

  const msg = await readNotice(searchParams);
  const suggested = String(user.user_metadata?.company_name ?? "");
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold text-gray-900">Set up your company</h1>
      <p className="mt-1 text-sm text-gray-600">This is the name your customers will see.</p>
      <form action={createCompany} className="card mt-6 space-y-4">
        <Notice {...msg} />
        <div>
          <label className="label" htmlFor="name">Company name</label>
          <input className="input" id="name" name="name" required minLength={2} maxLength={80} defaultValue={suggested} />
        </div>
        <div>
          <label className="label" htmlFor="slug">Web address</label>
          <div className="flex items-center gap-1">
            <input className="input" id="slug" name="slug" required pattern="[a-z0-9-]{2,40}" defaultValue={slugify(suggested)} placeholder="green-co" />
            <span className="whitespace-nowrap text-sm text-gray-500">.{rootDomain()}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">Lowercase letters, numbers and dashes. You can add your own domain later.</p>
        </div>
        <SubmitButton className="btn w-full" pendingText="Creating…">Continue</SubmitButton>
      </form>
    </div>
  );
}
