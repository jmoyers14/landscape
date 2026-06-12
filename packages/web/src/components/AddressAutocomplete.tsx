import { useEffect, useRef, useState } from "react";
import { trpcClient } from "../trpc.ts";
import { inputClass } from "./ui.tsx";

interface Suggestion {
  placeId: string;
  description: string;
  primary?: string;
  secondary?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 300;

/**
 * Address field backed by Google Places (proxied through our API). Suggestions
 * appear as the user types; picking one replaces the text with the canonical,
 * validated address. Free typing is still allowed — selection just guarantees a
 * clean address. A session token groups each typing burst + resolve for billing.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const sessionToken = useRef(crypto.randomUUID());
  // Skip the lookup on the value change we cause by accepting a suggestion.
  const skipNextLookup = useRef(false);

  useEffect(() => {
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await trpcClient.address.autocomplete.query({
          input: query,
          sessionToken: sessionToken.current,
        });
        if (!cancelled) {
          setSuggestions(results);
          setOpen(results.length > 0);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value]);

  const select = async (suggestion: Suggestion) => {
    skipNextLookup.current = true;
    setOpen(false);
    setSuggestions([]);
    try {
      const resolved = await trpcClient.address.resolve.query({
        placeId: suggestion.placeId,
        sessionToken: sessionToken.current,
      });
      onChange(resolved?.formattedAddress ?? suggestion.description);
    } catch {
      onChange(suggestion.description);
    } finally {
      // A resolve closes the billing session; start a fresh one.
      sessionToken.current = crypto.randomUUID();
    }
  };

  return (
    <div className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        // Delay so a suggestion click registers before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(suggestion)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="text-slate-800">
                  {suggestion.primary ?? suggestion.description}
                </span>
                {suggestion.secondary && (
                  <span className="ml-1 text-slate-400">
                    {suggestion.secondary}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
