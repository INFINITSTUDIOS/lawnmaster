import Link from "next/link";

const FEATURES = [
  ["Your own branded site", "Customers sign up on your domain, with your name, logo and colours."],
  ["Draw your service areas", "Outline each neighbourhood on the map and pick the days you mow there."],
  ["Subscriptions that bill themselves", "Weekly, 2-week, 3-week or monthly plans, paid straight into your Stripe account."],
  ["Prices by lawn size", "Customers trace their lawn on a satellite view and get the right price instantly."],
  ["A calendar that fills itself", "Customers pick from the dates you actually work their neighbourhood."],
  ["Upsell extra services", "Offer tree trimming, waste removal or anything else at a flat rate."],
];

const STEPS = [
  ["Create your company", "Sign up and get a ready-to-share site in a minute."],
  ["Connect Stripe", "Payments go directly to you. We never hold your money."],
  ["Set areas, days and prices", "Draw where you work and what you charge."],
  ["Share your link", "Customers sign up, pick a date, and you get the schedule."],
];

export default function Home() {
  return (
    <>
      <section className="bg-gradient-to-b from-brand-soft to-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
          <span className="badge">For lawn care &amp; landscaping companies</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Sign up customers, fill your routes, <span className="text-brand">get paid on repeat.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            LawnMaster gives your company its own sign-up site, service-area map, mowing schedule and
            recurring billing — all in one place.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn px-6 py-3 text-base">Create your company</Link>
            <Link href="/login" className="btn-outline px-6 py-3 text-base">Log in</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">Everything a mowing business runs on</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="card">
              <div className="mb-3 h-1.5 w-10 rounded-full bg-brand" />
              <h3 className="font-semibold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm text-gray-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-brand-soft">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">Up and running in an afternoon</h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="card">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
                <p className="mt-1 text-sm text-gray-600">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Link href="/signup" className="btn px-6 py-3 text-base">Start free</Link>
          </div>
        </div>
      </section>
    </>
  );
}
