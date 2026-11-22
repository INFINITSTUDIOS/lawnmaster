import Link from "next/link";
import type { Search } from "@/components/Notice";
import { fulfillCheckout } from "@/lib/stripe/fulfill";
import { requireTenant } from "@/lib/tenant";

/** Where Stripe Checkout sends the customer back to after paying. */
export default async function WelcomePage({ searchParams }: { searchParams: Search }) {
  const company = await requireTenant();
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  let confirmed = false;
  if (sessionId && /^cs_[A-Za-z0-9_]+$/.test(sessionId) && company.stripe_account_id) {
    try {
      // The webhook does this too; doing it here means the schedule is ready immediately.
      confirmed = await fulfillCheckout(sessionId, company.stripe_account_id);
    } catch (err) {
      console.error("fulfilment on return failed", err);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {confirmed ? (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-2xl text-white">✓</div>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">You&apos;re all set!</h1>
          <p className="mt-2 text-gray-600">Thanks for choosing {company.name}. Your payment went through and your visits are on the schedule.</p>
          <Link href="/account" className="btn mt-6">See my schedule</Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-gray-900">We&apos;re confirming your payment</h1>
          <p className="mt-2 text-gray-600">This usually takes a few seconds. Your account page will update once it&apos;s confirmed.</p>
          <Link href="/account" className="btn mt-6">Go to my account</Link>
        </>
      )}
    </div>
  );
}
