export const inputClass =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold";

export const ErrorNote = ({ message }: { message: string | null }) =>
  message ? (
    <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
  ) : null;
