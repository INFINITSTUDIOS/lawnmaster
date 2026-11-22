import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "@/lib/hosts";

/**
 * 1. Routes by hostname: the platform's own domain serves the marketing site
 *    and dashboard; any other host is a company storefront and is rewritten to
 *    /site/<host>/...
 * 2. Refreshes the Supabase session cookie.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const kind = classifyHost(host);
  const { pathname } = request.nextUrl;

  let response: NextResponse;
  if (kind.kind === "platform") {
    // Storefront routes are only reachable through a tenant hostname.
    if (pathname === "/site" || pathname.startsWith("/site/")) {
      return new NextResponse(null, { status: 404 });
    }
    response = NextResponse.next({ request });
  } else {
    const url = request.nextUrl.clone();
    url.pathname = `/site/${(host || "").toLowerCase()}${pathname === "/" ? "" : pathname}`;
    response = NextResponse.rewrite(url, { request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && anonKey) {
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // Validates the token and refreshes it if it is about to expire.
    await supabase.auth.getUser();
  }
  return response;
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
