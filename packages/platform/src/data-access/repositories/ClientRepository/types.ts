// The Client entity and its input shape are part of the app's domain model
// (they cross the API boundary), so they live in @landscape/domain. Re-exported
// here so the repository layer can keep importing them locally.
export type { Client, ClientInput } from "@landscape/domain";
