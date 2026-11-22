"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReservedSlug, platformUrl, slugify } from "@/lib/hosts";
import { back } from "@/lib/redirects";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function signUp(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = str(formData, "full_name");
  const companyName = str(formData, "company_name");
  if (!email || !fullName || companyName.length < 2) back("/signup", "error", "Please fill in every field.");
  if (password.length < 8) back("/signup", "error", "Password must be at least 8 characters.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, company_name: companyName },
      emailRedirectTo: platformUrl("/auth/confirm"),
    },
  });
  if (error) back("/signup", "error", error.message);
  if (!data.session) back("/login", "notice", "Check your email to confirm your account, then log in.");
  redirect("/onboarding");
}

export async function logIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(formData, "email").toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) back("/login", "error", "Wrong email or password.");
  redirect("/dashboard");
}

export async function logOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const name = str(formData, "name");
  const slug = slugify(str(formData, "slug") || name);
  if (name.length < 2) back("/onboarding", "error", "Enter your company name.");
  if (slug.length < 2 || isReservedSlug(slug)) back("/onboarding", "error", "Choose a different web address.");

  const { data: taken } = await createAdminClient().from("companies").select("id").eq("slug", slug).maybeSingle();
  if (taken) back("/onboarding", "error", `"${slug}" is already taken. Choose a different web address.`);

  const { error } = await supabase.rpc("create_company", { p_name: name, p_slug: slug });
  if (error) back("/onboarding", "error", error.message.includes("already belongs") ? "You already have a company." : "Could not create the company. Try again.");
  redirect("/dashboard");
}
