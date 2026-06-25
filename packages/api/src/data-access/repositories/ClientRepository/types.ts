/**
 * Client entity — plain data, free of Mongoose types. The repository maps
 * documents to this shape so nothing driver-related leaks past the boundary.
 */
export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

/**
 * Fields accepted when creating or replacing a client — the persisted fields
 * minus the server-managed id/createdAt. Derived from Client so the two can't
 * drift.
 */
export type ClientInput = Omit<Client, "id" | "createdAt">;
