import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpc, queryClient } from "./trpc.ts";

export const App = () => {
  const [name, setName] = useState("world");
  const [message, setMessage] = useState("");

  const hello = useQuery(trpc.greeting.hello.queryOptions({ name }));
  const greetings = useQuery(trpc.greeting.list.queryOptions());

  const addGreeting = useMutation(
    trpc.greeting.add.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.greeting.list.queryKey(),
        });
        setMessage("");
      },
    }),
  );

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold text-slate-800">Landscape</h1>
      <p className="mt-1 text-sm text-slate-500">
        Bun + tRPC + tsyringe + React
      </p>

      <section className="mt-8">
        <label className="block text-sm font-medium text-slate-700">
          Your name
          <input
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="mt-3 text-lg text-slate-800">
          {hello.isLoading ? "…" : hello.data?.message}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-800">Greetings</h2>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (message.trim()) addGreeting.mutate({ message });
          }}
        >
          <input
            className="flex-1 rounded border border-slate-300 px-3 py-2"
            placeholder="Add a greeting…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button
            className="rounded bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-50"
            type="submit"
            disabled={addGreeting.isPending}
          >
            Add
          </button>
        </form>
        <ul className="mt-4 space-y-1">
          {greetings.data?.map((g) => (
            <li key={g.id} className="rounded bg-slate-100 px-3 py-2">
              {g.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
