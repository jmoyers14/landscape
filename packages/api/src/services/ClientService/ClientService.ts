import type {
  Client,
  ClientInput,
} from "@landscape/platform";

export type { Client, ClientInput };

export interface ClientService {
  list(orgId: string): Promise<Client[]>;
  get(orgId: string, id: string): Promise<Client | null>;
  create(orgId: string, input: ClientInput): Promise<Client>;
  update(orgId: string, id: string, input: ClientInput): Promise<Client>;
  remove(orgId: string, id: string): Promise<void>;
}
