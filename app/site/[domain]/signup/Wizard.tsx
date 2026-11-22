"use client";

import { useState, useTransition } from "react";
import type { Polygon } from "geojson";
import { DatePicker } from "@/components/DatePicker";
import { AddressSearch, type Place } from "@/components/map/AddressSearch";
import { LawnTracer } from "@/components/map/LawnTracer";
import { polygonSqft } from "@/lib/geo";
import { formatMoney, tierForSqft } from "@/lib/pricing";
import { FREQUENCIES, FREQUENCY_LABEL, type Frequency, type LawnTier } from "@/lib/types";
import { lookupAddress, startSignup, type LookupResult, type SignupInput } from "../actions";

type Quote = Extract<LookupResult, { ok: true }>;
type AddonOption = { id: string; name: string; description: string | null; price_cents: number };

const STEPS = ["Address", "Lawn", "Plan", "First visit", "Extras", "Checkout"] as const;

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function Wizard({
  companyName,
  mapboxToken,
  addons,
  center,
  signedInEmail,
  defaultName,
}: {
  companyName: string;
  mapboxToken: string | null;
  addons: AddonOption[];
  center: [number, number] | null;
  signedInEmail: string | null;
  defaultName: string;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [place, setPlace] = useState<Place | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [outline, setOutline] = useState<Polygon | null>(null);
  const [manualTier, setManualTier] = useState<string | null>(null);
  const [useManual, setUseManual] = useState(!mapboxToken);
  const [frequency, setFrequency] = useState<Frequency | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [extras, setExtras] = useState<string[]>([]);
  const [account, setAccount] = useState({ fullName: defaultName, phone: "", email: "", password: "" });

  const tiers = (quote?.tiers ?? []) as LawnTier[];
  const sqft = outline ? polygonSqft(outline) : null;
  const tier = useManual ? tiers.find((t) => t.id === manualTier) ?? null : sqft !== null && sqft >= 50 ? tierForSqft(tiers, sqft) : null;
  const priceOf = (f: Frequency) => quote?.prices.find((p) => p.tier_id === tier?.id && p.frequency === f)?.price_cents ?? null;
  const price = frequency ? priceOf(frequency) : null;
  const chosenAddons = addons.filter((a) => extras.includes(a.id));
  const dueToday = (price ?? 0) + chosenAddons.reduce((s, a) => s + a.price_cents, 0);

  const go = (n: number) => {
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0 });
  };

  function checkAddress(p: Place) {
    setPlace(p);
    setError(null);
    setQuote(null);
    startTransition(async () => {
      const result = await lookupAddress(p.lng, p.lat);
      if (result.ok) {
        setQuote(result);
        // A new address invalidates everything chosen for the old one.
        setOutline(null);
        setManualTier(null);
        setFrequency(null);
        setDate(null);
      } else {
        setError(
          result.reason === "outside"
            ? `Sorry — ${companyName} doesn't service that address yet.`
            : `${companyName} isn't taking online sign-ups for that address right now.`,
        );
      }
    });
  }

  function submit() {
    if (!place || !frequency || !date) return;
    setError(null);
    startTransition(async () => {
      const result = await startSignup({
        address: place.label,
        lng: place.lng,
        lat: place.lat,
        outline: (useManual ? null : outline) as SignupInput["outline"],
        tierId: useManual ? manualTier : null,
        frequency,
        startDate: date,
        addonIds: extras,
        fullName: account.fullName,
        phone: account.phone,
        ...(signedInEmail ? {} : { email: account.email, password: account.password }),
      });
      if ("url" in result) window.location.assign(result.url);
      else setError(result.error);
    });
  }

  const accountReady = account.fullName.trim().length >= 2 && (signedInEmail !== null || (/\S+@\S+\.\S+/.test(account.email) && account.password.length >= 8));

  return (
    <div>
      <ol className="mb-6 flex gap-1" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-gray-200"}`} />
            <span className={`mt-1 hidden text-xs sm:block ${i === step ? "font-semibold text-brand-dark" : "text-gray-500"}`}>{label}</span>
          </li>
        ))}
      </ol>
      <p className="mb-2 text-sm text-gray-500 sm:hidden">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>

      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <div className="card">
        {step === 0 && (
          <>
            <h2 className="text-xl font-bold text-gray-900">What&apos;s your address?</h2>
            <p className="mt-1 text-sm text-gray-600">We&apos;ll check that we mow in your neighborhood.</p>
            <div className="mt-4">
              {mapboxToken ? (
                <>
                  <label className="label" htmlFor="address">Home address</label>
                  <AddressSearch id="address" token={mapboxToken} kind="address" proximity={center} placeholder="Start typing your address…" onSelect={checkAddress} />
                </>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Address lookup isn&apos;t configured yet. Please contact {companyName} to sign up.</p>
              )}
            </div>
            {pending && <p className="mt-3 text-sm text-gray-600" role="status">Checking your address…</p>}
            {quote && place && (
              <div className="mt-4 rounded-lg border border-brand-line bg-brand-soft p-3 text-sm text-brand-dark" role="status">
                Good news — we mow in <strong>{quote.areaName}</strong>.
              </div>
            )}
            <Nav next={() => go(1)} nextDisabled={!quote || pending} />
          </>
        )}

        {step === 1 && quote && place && (
          <>
            <h2 className="text-xl font-bold text-gray-900">How big is your lawn?</h2>
            {!useManual && mapboxToken ? (
              <>
                <p className="mt-1 text-sm text-gray-600">
                  Click around the edge of your lawn on the satellite view, then double-click to finish. Leave out the house and driveway.
                </p>
                <div className="mt-4">
                  <LawnTracer token={mapboxToken} lng={place.lng} lat={place.lat} initial={outline} onChange={setOutline} />
                </div>
                <p className="mt-3 text-sm" role="status">
                  {sqft === null ? (
                    <span className="text-gray-600">No outline yet.</span>
                  ) : sqft < 50 ? (
                    <span className="text-red-700">That outline is too small — please trace it again.</span>
                  ) : (
                    <span className="text-gray-900">About <strong>{sqft.toLocaleString()} sq ft</strong> — that&apos;s a <strong>{tier?.name}</strong> lawn.</span>
                  )}
                </p>
                <button type="button" className="mt-2 text-sm text-brand underline" onClick={() => setUseManual(true)}>I&apos;d rather just pick a size</button>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-gray-600">Pick the closest size. We&apos;ll confirm it on our first visit.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Lawn size">
                  {tiers.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={manualTier === t.id}
                      onClick={() => setManualTier(t.id)}
                      className={`rounded-xl border p-4 text-left ${manualTier === t.id ? "border-brand bg-brand-soft ring-2 ring-brand-line" : "border-gray-200 hover:border-brand-line"}`}
                    >
                      <span className="block font-semibold text-gray-900">{t.name}</span>
                      <span className="text-sm text-gray-600">
                        {t.max_sqft === null ? `Over ${t.min_sqft.toLocaleString()} sq ft` : `${t.min_sqft.toLocaleString()}–${t.max_sqft.toLocaleString()} sq ft`}
                      </span>
                    </button>
                  ))}
                </div>
                {mapboxToken && <button type="button" className="mt-3 text-sm text-brand underline" onClick={() => setUseManual(false)}>Measure it on the map instead</button>}
              </>
            )}
            <Nav back={() => go(0)} next={() => { if (frequency && priceOf(frequency) === null) setFrequency(null); go(2); }} nextDisabled={!tier} />
          </>
        )}

        {step === 2 && tier && (
          <>
            <h2 className="text-xl font-bold text-gray-900">How often should we mow?</h2>
            <p className="mt-1 text-sm text-gray-600">Prices for a {tier.name.toLowerCase()} lawn. You&apos;re billed each time your plan renews.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Mowing frequency">
              {FREQUENCIES.filter((f) => priceOf(f) !== null).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={frequency === f}
                  onClick={() => setFrequency(f)}
                  className={`rounded-xl border p-4 text-left ${frequency === f ? "border-brand bg-brand-soft ring-2 ring-brand-line" : "border-gray-200 hover:border-brand-line"}`}
                >
                  <span className="block font-semibold text-gray-900">{FREQUENCY_LABEL[f]}</span>
                  <span className="text-2xl font-bold text-brand-dark">{formatMoney(priceOf(f)!)}</span>
                  <span className="text-sm text-gray-600"> per visit</span>
                </button>
              ))}
            </div>
            {FREQUENCIES.every((f) => priceOf(f) === null) && <p className="mt-3 text-sm text-red-700">No plans are offered for this lawn size. Go back and pick another size.</p>}
            <Nav back={() => go(1)} next={() => go(3)} nextDisabled={!frequency} />
          </>
        )}

        {step === 3 && quote && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Pick your first mowing day</h2>
            <p className="mt-1 text-sm text-gray-600">These are the days we&apos;re in {quote.areaName}. Later visits follow from this date.</p>
            <div className="mt-4"><DatePicker available={quote.dates} value={date} onChange={setDate} /></div>
            {date && <p className="mt-3 text-center text-sm text-gray-900" role="status">First visit: <strong>{longDate(date)}</strong></p>}
            <Nav back={() => go(2)} next={() => go(addons.length ? 4 : 5)} nextDisabled={!date} />
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Anything else?</h2>
            <p className="mt-1 text-sm text-gray-600">Optional one-time services, billed with your first visit.</p>
            <div className="mt-4 space-y-3">
              {addons.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--brand)]"
                    checked={extras.includes(a.id)}
                    onChange={(e) => setExtras(e.target.checked ? [...extras, a.id] : extras.filter((x) => x !== a.id))}
                  />
                  <span className="flex-1">
                    <span className="block font-semibold text-gray-900">{a.name}</span>
                    {a.description && <span className="block text-sm text-gray-600">{a.description}</span>}
                  </span>
                  <span className="font-semibold text-brand-dark">{formatMoney(a.price_cents)}</span>
                </label>
              ))}
            </div>
            <Nav back={() => go(3)} next={() => go(5)} nextLabel={extras.length ? "Continue" : "No thanks, continue"} />
          </>
        )}

        {step === 5 && place && frequency && date && price !== null && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Review and pay</h2>
            <dl className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
              <Line k="Address" v={place.label} />
              <Line k="Plan" v={`${FREQUENCY_LABEL[frequency]} · ${tier?.name} lawn`} />
              <Line k="First visit" v={longDate(date)} />
              <Line k="Mowing" v={`${formatMoney(price)} per visit`} />
              {chosenAddons.map((a) => <Line key={a.id} k={a.name} v={`${formatMoney(a.price_cents)} once`} />)}
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
                <dt>Due today</dt>
                <dd>{formatMoney(dueToday)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-gray-500">
              Then {formatMoney(price)} {FREQUENCY_LABEL[frequency].toLowerCase()} until you cancel. Cancel any time from your account.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="fullName">Your name</label>
                <input className="input" id="fullName" autoComplete="name" value={account.fullName} onChange={(e) => setAccount({ ...account, fullName: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="phone">Phone (optional)</label>
                <input className="input" id="phone" type="tel" autoComplete="tel" value={account.phone} onChange={(e) => setAccount({ ...account, phone: e.target.value })} />
              </div>
              {signedInEmail ? (
                <p className="text-sm text-gray-600 sm:col-span-2">Signed in as <strong>{signedInEmail}</strong>.</p>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="email">Email</label>
                    <input className="input" id="email" type="email" autoComplete="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="password">Create a password</label>
                    <input className="input" id="password" type="password" autoComplete="new-password" minLength={8} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} />
                    <p className="mt-1 text-xs text-gray-500">At least 8 characters. You&apos;ll use it to manage your plan.</p>
                  </div>
                </>
              )}
            </div>
            <Nav back={() => go(addons.length ? 4 : 3)} next={submit} nextLabel={pending ? "Opening secure checkout…" : `Continue to payment`} nextDisabled={!accountReady || pending} />
          </>
        )}
      </div>
    </div>
  );
}

function Nav({ back, next, nextLabel = "Continue", nextDisabled }: { back?: () => void; next: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {back ? <button type="button" className="btn-outline" onClick={back}>Back</button> : <span />}
      <button type="button" className="btn" onClick={next} disabled={nextDisabled}>{nextLabel}</button>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-600">{k}</dt>
      <dd className="text-right text-gray-900">{v}</dd>
    </div>
  );
}
