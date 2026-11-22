import Link from "next/link";
import { Notice, readNotice, type Search } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { logIn } from "../actions";

export const metadata = { title: "Log in · LawnMaster" };

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const msg = await readNotice(searchParams);
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-2xl font-bold text-gray-900">Log in</h1>
      <form action={logIn} className="card mt-6 space-y-4">
        <Notice {...msg} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <SubmitButton className="btn w-full" pendingText="Logging in…">Log in</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">
        New here? <Link href="/signup" className="font-medium text-brand hover:underline">Create your company</Link>
      </p>
    </div>
  );
}
