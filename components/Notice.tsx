/** Shows the ?error= / ?notice= message that server actions redirect with. */
export function Notice({ error, notice }: { error?: string; notice?: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p role="status" className="mb-4 rounded-lg border border-brand-line bg-brand-soft px-3 py-2 text-sm text-brand-dark">
        {notice}
      </p>
    );
  }
  return null;
}

export type Search = Promise<Record<string, string | string[] | undefined>>;

export async function readNotice(searchParams: Search): Promise<{ error?: string; notice?: string }> {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { error: one(sp.error), notice: one(sp.notice) };
}
