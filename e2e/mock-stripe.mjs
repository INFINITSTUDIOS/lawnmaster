// A tiny stand-in for the Stripe API, for end-to-end tests without network access.
// It implements only the calls LawnMaster makes, records every request, and
// "completes" a checkout when the browser visits the session's payment URL.
// It does NOT validate that real Stripe would accept the parameters.
import http from "node:http";

const PORT = Number(process.env.MOCK_STRIPE_PORT || 12111);
const accounts = new Map();
const sessions = new Map();
const subscriptions = new Map();
const requests = [];
let n = 0;

const json = (res, body, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const params = Object.fromEntries(new URLSearchParams(raw));
    const path = url.pathname;
    const account = req.headers["stripe-account"] ?? null;
    if (path.startsWith("/v1/")) requests.push({ method: req.method, path, account, params });

    if (path === "/__requests") return json(res, requests);

    // Browser lands here from checkout: mark paid and bounce back to the app.
    if (path.startsWith("/pay/")) {
      const s = sessions.get(path.slice(5));
      if (!s) return json(res, { error: "no such session" }, 404);
      s.status = "complete";
      s.payment_status = "paid";
      s.customer = s.customer ?? `cus_mock${++n}`;
      if (s.mode === "subscription") {
        s.subscription = `sub_mock${++n}`;
        subscriptions.set(s.subscription, {
          id: s.subscription,
          object: "subscription",
          status: "active",
          items: { data: [{ id: `si_mock${n}`, price: { currency: "usd", product: `prod_mock${n}`, recurring: { interval: "week" } } }] },
        });
      }
      res.writeHead(302, { Location: s.success_url.replace("{CHECKOUT_SESSION_ID}", s.id) });
      return res.end();
    }

    if (req.method === "POST" && path === "/v1/accounts") {
      const a = { id: `acct_mock${++n}`, object: "account", charges_enabled: false };
      accounts.set(a.id, a);
      return json(res, a);
    }
    if (req.method === "POST" && path === "/v1/account_links") {
      // Pretend the owner completed onboarding.
      const a = accounts.get(params.account);
      if (a) a.charges_enabled = true;
      return json(res, { object: "account_link", url: params.return_url });
    }
    let m;
    if (req.method === "GET" && (m = path.match(/^\/v1\/accounts\/(.+)$/))) {
      const a = accounts.get(m[1]);
      return a ? json(res, a) : json(res, { error: { message: "No such account" } }, 404);
    }
    if (req.method === "POST" && path === "/v1/checkout/sessions") {
      const id = `cs_test_mock${++n}`;
      const s = {
        id,
        object: "checkout.session",
        mode: params.mode,
        status: "open",
        payment_status: "unpaid",
        customer: params.customer ?? null,
        subscription: null,
        success_url: params.success_url,
        url: `http://localhost:${PORT}/pay/${id}`,
        account,
      };
      sessions.set(id, s);
      return json(res, s);
    }
    if (req.method === "GET" && (m = path.match(/^\/v1\/checkout\/sessions\/(.+)$/))) {
      const s = sessions.get(m[1]);
      return s && s.account === account ? json(res, s) : json(res, { error: { message: "No such session" } }, 404);
    }
    if ((m = path.match(/^\/v1\/subscriptions\/(.+)$/))) {
      const sub = subscriptions.get(m[1]);
      if (!sub) return json(res, { error: { message: "No such subscription" } }, 404);
      if (req.method === "DELETE") sub.status = "canceled";
      return json(res, sub);
    }
    if (req.method === "POST" && path === "/v1/billing_portal/sessions") {
      return json(res, { object: "billing_portal.session", url: params.return_url });
    }
    json(res, { error: { message: `mock-stripe: unhandled ${req.method} ${path}` } }, 404);
  })
  .listen(PORT, () => console.log(`mock stripe on :${PORT}`));
