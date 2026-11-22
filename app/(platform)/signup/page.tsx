import Link from "next/link";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { signUp } from "../actions";

export const metadata = { title: "Create your company · LawnMaster" };

export default async function SignupPage({ searchParams }: { searchParams: Search }) {
  const msg = await readNotice(searchParams);
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold text-gray-900">Create your company account</h1>
      <p className="mt-1 text-sm text-gray-600">Free to set up. Payments go straight to your own Stripe account.</p>
      <form action={signUp} className="card mt-6 space-y-4">
        <Notice {...msg} />
        <div>
          <label className="label" htmlFor="company_name">Company name</label>
          <input className="input" id="company_name" name="company_name" required minLength={2} maxLength={80} placeholder="Green Co. Lawn Care" />
        </div>
        <div>
          <label className="label" htmlFor="full_name">Your name</label>
          <input className="input" id="full_name" name="full_name" required autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
        </div>
        <SubmitButton className="btn w-full" pendingText="Creating…">Create account</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">
        Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Log in</Link>
      </p>
    </div>
  );
}
