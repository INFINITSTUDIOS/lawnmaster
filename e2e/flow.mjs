// End-to-end walkthrough: landscaper sets up a company, a customer signs up and
// pays, and the visit shows up on the schedule.
//
// Needs: local Supabase (`npx supabase start`), `node e2e/mock-stripe.mjs`, and the
// app built and started with the e2e env (see README). Mapbox is stubbed: the
// geocoder is mocked and the map canvas is not exercised.
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const Stripe = require("stripe");

const ROOT = "http://localhost:3000";
const SHOP = "http://greenco-RUN.localhost:3000";
const run = Date.now().toString(36);
const slug = `greenco-${run}`;
const shop = SHOP.replace("greenco-RUN", slug);
const shots = process.env.SHOTS_DIR;
const BOX = { type: "Polygon", coordinates: [[[-97.75, 30.27], [-97.74, 30.27], [-97.74, 30.28], [-97.75, 30.28], [-97.75, 30.27]]] };

const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);

async function newPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: shots ? 2 : 1 });
  await ctx.route("https://api.mapbox.com/search/geocode/**", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    const far = /far/i.test(q);
    route.fulfill({
      json: { features: [{ geometry: { coordinates: far ? [-97.8, 30.275] : [-97.745, 30.275] }, properties: { full_address: far ? "9 Far Away Rd, Austin, TX" : "12 Main Street, Austin, TX" } }] },
    });
  });
  await ctx.route(/mapbox\.com\/(?!search\/geocode)/, (route) => route.abort());
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  page error:", e.message));
  return page;
}
const shot = async (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });

// ------------------------------------------------------------ landscaper
const owner = await newPage();
await owner.goto(ROOT);
await shot(owner, "01-landing");
await owner.getByRole("link", { name: "Create your company" }).click();
await owner.getByLabel("Company name").fill("Green Co");
await owner.getByLabel("Your name").fill("Olive Owner");
await owner.getByLabel("Email").fill(`owner-${run}@example.com`);
await owner.getByLabel("Password").fill("correct-horse-battery");
await owner.getByRole("button", { name: "Create account" }).click();
await owner.waitForURL("**/onboarding");
await owner.getByLabel("Web address").fill(slug);
await owner.getByRole("button", { name: "Continue" }).click();
await owner.waitForURL("**/dashboard");
await owner.getByText("Finish setting up").waitFor();
step("landscaper signs up and creates a company");

// Storefront exists but is closed until Stripe + prices are in place.
const visitor = await newPage();
await visitor.goto(shop);
await visitor.getByText("Online sign-up is opening soon").waitFor();
step("storefront shows 'opening soon' before setup");

await owner.goto(`${ROOT}/dashboard/settings`);
await owner.getByRole("button", { name: "Connect Stripe" }).click();
await owner.waitForURL("**/dashboard/settings?stripe=return");
await owner.getByText("Connected", { exact: true }).waitFor();
step("Stripe connect round-trip marks the company connected");

await owner.goto(`${ROOT}/dashboard/areas/new`);
await owner.getByLabel("Area name").fill("Northside");
// The map can't load here; put the polygon straight into the form field it writes to.
await owner.locator('input[name="boundary"]').evaluate((el, v) => (el.value = v), JSON.stringify(BOX));
await owner.getByLabel("Tuesday").check();
await owner.getByLabel("Thursday").check();
await owner.getByLabel("Most lawns you can mow here in a day").fill("1");
await owner.getByRole("button", { name: "Create area" }).click();
await owner.waitForURL(/\/dashboard\/areas\/[0-9a-f-]{36}/);
await owner.getByText("Area created").waitFor();
for (const [label, value] of [["Small, Every week", "45"], ["Small, Every 2 weeks", "55"], ["Small, Every 3 weeks", "60"], ["Small, Once a month", "70.50"], ["Medium, Every week", "65"]]) {
  await owner.getByLabel(label, { exact: true }).fill(value);
}
await owner.getByRole("button", { name: "Save prices" }).click();
await owner.getByText("Prices saved.").waitFor();
assert.equal(await owner.getByLabel("Small, Once a month", { exact: true }).inputValue(), "70.50");
await shot(owner, "02-area");
step("area with service days, capacity and prices saved");

await owner.goto(`${ROOT}/dashboard/services`);
await owner.getByLabel("Service", { exact: true }).fill("Tree trimming");
await owner.getByLabel("Flat price ($)").fill("150");
await owner.getByRole("button", { name: "Add service" }).click();
await owner.getByText("Service saved.").waitFor();
step("extra service added");

// -------------------------------------------------------------- customer
await visitor.goto(shop);
await visitor.getByText("from").first().waitFor();
assert.match(await visitor.locator("main").innerText(), /\$45/);
assert.match(await visitor.locator("main").innerText(), /Tree trimming/);
await shot(visitor, "03-storefront");
await visitor.getByRole("link", { name: "Check my address" }).click();

await visitor.getByLabel("Home address").fill("9 Far Away");
await visitor.getByRole("button", { name: /Far Away Rd/ }).click();
await visitor.getByText("doesn't service that address yet").waitFor();
assert.ok(await visitor.getByRole("button", { name: "Continue" }).isDisabled());
step("out-of-area address is rejected");

await visitor.getByLabel("Home address").fill("12 Main");
await visitor.getByRole("button", { name: /12 Main Street/ }).click();
await visitor.getByText("Good news").waitFor();
await visitor.getByRole("button", { name: "Continue" }).click();
await visitor.getByRole("button", { name: "I'd rather just pick a size" }).click();
// Only sizes with a price in this area are offered.
assert.equal(await visitor.getByRole("radio").count(), 2);
await visitor.getByRole("radio", { name: /Small/ }).click();
await visitor.getByRole("button", { name: "Continue" }).click();
assert.equal(await visitor.getByRole("radio").count(), 4);
await visitor.getByRole("radio", { name: /Every 2 weeks/ }).click();
await shot(visitor, "04-plan");
await visitor.getByRole("button", { name: "Continue" }).click();
const days = visitor.locator('button[aria-pressed]:not([disabled])');
const firstLabel = await days.first().getAttribute("aria-label");
await days.first().click();
await shot(visitor, "05-date");
await visitor.getByRole("button", { name: "Continue" }).click();
await visitor.getByLabel(/Tree trimming/).check();
await visitor.getByRole("button", { name: "Continue" }).click();
assert.match(await visitor.locator("dl").innerText(), /Due today\s*\$205/);
await visitor.getByLabel("Your name").fill("Casey Customer");
await visitor.getByLabel("Email").fill(`casey-${run}@example.com`);
await visitor.getByLabel("Create a password").fill("lawn-lover-123");
await shot(visitor, "06-review");
await visitor.getByRole("button", { name: "Continue to payment" }).click();
await visitor.waitForURL("**/welcome?session_id=*");
await visitor.getByText("You're all set!").waitFor();
step(`customer signs up (first visit ${firstLabel}) and pays`);

// What we asked Stripe for.
const calls = await (await fetch("http://localhost:12111/__requests")).json();
const checkout = calls.filter((c) => c.path === "/v1/checkout/sessions" && c.method === "POST").at(-1);
assert.match(checkout.account, /^acct_mock/);
assert.equal(checkout.params.mode, "subscription");
assert.equal(checkout.params["line_items[0][price_data][unit_amount]"], "5500");
assert.equal(checkout.params["line_items[0][price_data][recurring][interval]"], "week");
assert.equal(checkout.params["line_items[0][price_data][recurring][interval_count]"], "2");
assert.equal(checkout.params["line_items[1][price_data][unit_amount]"], "15000");
assert.equal(checkout.params["line_items[1][price_data][recurring][interval]"], undefined);
assert.equal(checkout.params["subscription_data[application_fee_percent]"], undefined);
step("checkout sent to the company's connected account: $55 every 2 weeks + $150 once, no platform fee");

await visitor.getByRole("link", { name: "See my schedule" }).click();
await visitor.getByText("Upcoming visits").waitFor();
const visitTexts = await visitor.locator("section", { hasText: "Upcoming visits" }).locator("li").allInnerTexts();
assert.ok(visitTexts.length >= 4, `expected 4+ visits in 8 weeks, got ${visitTexts.length}`);
const parsed = visitTexts.map((t) => Date.parse(`${t.split("\n")[0]} 2026 UTC`));
// (year is irrelevant for gap checks within one season; handle year wrap by modulo)
for (let i = 1; i < parsed.length; i++) {
  const gap = Math.round((parsed[i] - parsed[i - 1]) / 86400000);
  assert.ok(gap === 14 || gap === 14 - 365 || gap === 14 - 366, `visits should be 14 days apart, got ${gap}`);
}
assert.match(await visitor.locator("main").innerText(), /\$55 per visit · every 2 weeks/);
assert.match(await visitor.locator("main").innerText(), /Tree trimming · \$150/);
await shot(visitor, "07-account");
step("account shows the plan, visits 14 days apart, and the paid extra");

// Capacity is 1/day, so the date Casey took is gone for the next customer.
const second = await newPage({ width: 390, height: 844 });
await second.goto(`${shop}/signup`);
await second.getByLabel("Home address").fill("12 Main");
await second.getByRole("button", { name: /12 Main Street/ }).click();
await second.getByText("Good news").waitFor();
await second.getByRole("button", { name: "Continue" }).click();
await second.getByRole("button", { name: "I'd rather just pick a size" }).click();
await second.getByRole("radio", { name: /Small/ }).click();
await second.getByRole("button", { name: "Continue" }).click();
await second.getByRole("radio", { name: /Every week/ }).click();
await second.getByRole("button", { name: "Continue" }).click();
const takenBtn = second.getByRole("button", { name: `${firstLabel}, unavailable` });
if (await takenBtn.count()) assert.ok(await takenBtn.isDisabled());
else assert.equal(await second.getByRole("button", { name: firstLabel, exact: true }).count(), 0);
await shot(second, "08-mobile-date");
step("a full day is no longer offered to the next customer");

// --------------------------------------------------- back in the dashboard
await owner.goto(`${ROOT}/dashboard/customers`);
const row = owner.locator("tr", { hasText: "Casey Customer" });
assert.match(await row.innerText(), /Northside/);
assert.match(await row.innerText(), /Every 2 weeks · \$55/);
assert.match(await row.innerText(), /Active/);
await owner.goto(`${ROOT}/dashboard`);
assert.match(await owner.locator("main").innerText(), /Active subscribers\s*1/);
await shot(owner, "09-dashboard");
await owner.goto(`${ROOT}/dashboard/schedule`);
await shot(owner, "10-schedule");
assert.match(await owner.locator("main").innerText(), /Tree trimming/);
await owner.locator('a[href*="/dashboard/schedule?date="]', { hasText: "1 lawns" }).first().click();
await owner.waitForURL(/schedule\?date=/);
const areaCard = owner.locator("section", { hasText: "Northside" });
await areaCard.getByText("Casey Customer").waitFor();
await areaCard.getByRole("button", { name: "Mark done" }).click();
await areaCard.getByText("Done", { exact: true }).waitFor();
await areaCard.getByRole("button", { name: "Undo" }).waitFor();
step("manager sees the customer, revenue, and can complete the visit");

// A second company's owner must not see the first company's customer.
const other = await newPage();
await other.goto(`${ROOT}/signup`);
await other.getByLabel("Company name").fill("Rival Lawns");
await other.getByLabel("Your name").fill("Rex Rival");
await other.getByLabel("Email").fill(`rival-${run}@example.com`);
await other.getByLabel("Password").fill("correct-horse-battery");
await other.getByRole("button", { name: "Create account" }).click();
await other.waitForURL("**/onboarding");
await other.getByLabel("Web address").fill(`rival-${run}`);
await other.getByRole("button", { name: "Continue" }).click();
await other.waitForURL("**/dashboard");
await other.goto(`${ROOT}/dashboard/customers`);
await other.getByText("No customers yet").waitFor();
const customerUrl = await owner.locator("a", { hasText: "Casey Customer" }).first().getAttribute("href");
const res = await other.goto(`${ROOT}${customerUrl}`);
assert.equal(res.status(), 404);
step("another company cannot see this company's customers");

// ----------------------------------------------------------------- webhook
const stripe = new Stripe("sk_test_mock");
const sendEvent = async (event) => {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_e2e_test_secret" });
  return fetch(`${ROOT}/api/stripe/webhook`, { method: "POST", body: payload, headers: { "stripe-signature": header } });
};
const bad = await fetch(`${ROOT}/api/stripe/webhook`, { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=bad" } });
assert.equal(bad.status, 400);
// Customer cancels from their account: plan canceled, visits removed.
await visitor.goto(`${shop}/account`);
await visitor.getByText("Cancel plan").click();
await visitor.getByRole("button", { name: "Yes, cancel my plan" }).click();
await visitor.getByText("Your plan is canceled").waitFor();
assert.equal(await visitor.getByText("Upcoming visits").count(), 0);
const cancelCall = (await (await fetch("http://localhost:12111/__requests")).json()).find((c) => c.method === "DELETE");
assert.match(cancelCall.path, /^\/v1\/subscriptions\/sub_mock/);
assert.match(cancelCall.account, /^acct_mock/);
step("customer cancels: Stripe subscription canceled on the connected account, visits removed");

// account.updated with charges disabled closes the storefront again.
const acct = cancelCall.account;
const ok = await sendEvent({ id: `evt_${run}_1`, object: "event", type: "account.updated", account: acct, data: { object: { id: acct, object: "account", charges_enabled: false } } });
assert.equal(ok.status, 200);
const dup = await (await sendEvent({ id: `evt_${run}_1`, object: "event", type: "account.updated", account: acct, data: { object: { id: acct, object: "account", charges_enabled: true } } })).json();
assert.equal(dup.duplicate, true);
await visitor.goto(shop);
await visitor.getByText("Online sign-up is opening soon").waitFor();
step("signed webhook is applied once; bad signature and replay are rejected");

await browser.close();
console.log("\nALL E2E STEPS PASSED");
