import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, inputClass } from "../components/ui.tsx";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg"] as const;

type Draft = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  licenseNumber: string;
};

const EMPTY: Draft = {
  businessName: "",
  address: "",
  phone: "",
  email: "",
  licenseNumber: "",
};

/**
 * The business identity at the head of every generated document.
 *
 * The logo never passes through the API: `requestLogoUpload` returns a signed
 * PUT URL, the browser uploads straight to storage, and `confirmLogo` validates
 * what landed. That order is why the button stays disabled until confirm
 * resolves — the upload isn't real until the server has accepted it.
 */
export function CompanySettingsScreen() {
  const profile = useQuery(trpc.company.get.queryOptions());
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile.data) {
      return;
    }
    setDraft({
      businessName: profile.data.businessName ?? "",
      address: profile.data.address ?? "",
      phone: profile.data.phone ?? "",
      email: profile.data.email ?? "",
      licenseNumber: profile.data.licenseNumber ?? "",
    });
  }, [profile.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.company.get.queryKey() });

  const update = useMutation(
    trpc.company.update.mutationOptions({
      onSuccess: () => {
        setSaved(true);
        invalidate();
      },
      onError: (e: { message: string }) => setError(e.message),
    }),
  );

  const requestUpload = useMutation(
    trpc.company.requestLogoUpload.mutationOptions(),
  );
  const confirmLogo = useMutation(
    trpc.company.confirmLogo.mutationOptions({ onSuccess: invalidate }),
  );

  const onPickLogo = async (file: File) => {
    setError(null);
    // Checked here for a fast, clear message; checked again server-side because
    // a signed PUT URL cannot enforce size and a client check is not a control.
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      setError("Logo must be a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 2MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const ticket = await requestUpload.mutateAsync({
        contentType: file.type as (typeof ALLOWED_TYPES)[number],
      });
      const put = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!put.ok) {
        throw new Error("Upload failed");
      }
      await confirmLogo.mutateAsync({ key: ticket.key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const field = (key: keyof Draft, label: string, type = "text") => (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        type={type}
        className={inputClass}
        value={draft[key]}
        onChange={(event) => {
          setSaved(false);
          setDraft({ ...draft, [key]: event.target.value });
        }}
      />
    </label>
  );

  if (profile.isLoading) {
    return <Page max="2xl">Loading…</Page>;
  }

  return (
    <Page max="2xl" className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Company profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          This appears at the top of every estimate and parts order you send.
        </p>
      </div>

      <ErrorNote message={error} />

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          update.mutate({
            businessName: draft.businessName,
            address: draft.address || null,
            phone: draft.phone || null,
            email: draft.email || null,
            licenseNumber: draft.licenseNumber || null,
          });
        }}
      >
        {field("businessName", "Business name")}
        {field("address", "Address")}
        {field("phone", "Phone")}
        {field("email", "Email", "email")}
        {field("licenseNumber", "License number")}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          {saved ? <span className="text-sm text-green-700">Saved</span> : null}
        </div>
      </form>

      <div className="space-y-2 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-medium text-slate-700">Logo</h2>
        <p className="text-sm text-slate-500">
          PNG or JPEG, up to 2MB. Documents render fine without one.
        </p>
        {profile.data?.logoStorageKey ? (
          <p className="text-sm text-slate-600">A logo is on file.</p>
        ) : null}
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={uploading}
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onPickLogo(file);
            }
            event.target.value = "";
          }}
        />
        {uploading ? (
          <p className="text-sm text-slate-500">Uploading…</p>
        ) : null}
      </div>
    </Page>
  );
}
