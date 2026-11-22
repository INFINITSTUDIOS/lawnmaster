const STYLE: Record<string, string> = {
  active: "bg-brand-soft text-brand-dark",
  past_due: "bg-amber-100 text-amber-900",
  canceled: "bg-gray-100 text-gray-600",
  pending: "bg-gray-100 text-gray-600",
};
const LABEL: Record<string, string> = { active: "Active", past_due: "Payment failed", canceled: "Canceled", pending: "Not paid yet" };

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "none";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE[s] ?? "bg-gray-100 text-gray-600"}`}>
      {LABEL[s] ?? "No plan"}
    </span>
  );
}
