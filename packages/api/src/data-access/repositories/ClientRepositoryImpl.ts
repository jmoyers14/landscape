import { injectable } from "tsyringe";
import { ClientModel } from "../models/Client.ts";
import type { Client, ClientInput, ClientRepository } from "./ClientRepository.ts";

type ClientDoc = {
  _id: unknown;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: Date;
};

/**
 * Mongoose-backed ClientRepository — the only place client persistence lives.
 * Every query filters by `orgId`, and documents are mapped to the plain Client
 * entity so Mongoose types never escape.
 */
@injectable()
export class ClientRepositoryImpl implements ClientRepository {
  async findByOrg(orgId: string): Promise<Client[]> {
    const docs = await ClientModel.find({ orgId })
      .sort({ createdAt: -1 })
      .lean<ClientDoc[]>();
    return docs.map(toClient);
  }

  async findById(orgId: string, id: string): Promise<Client | null> {
    const doc = await ClientModel.findOne({ _id: id, orgId }).lean<ClientDoc | null>();
    return doc ? toClient(doc) : null;
  }

  async findByEmail(orgId: string, email: string): Promise<Client | null> {
    const doc = await ClientModel.findOne({ orgId, email }).lean<ClientDoc | null>();
    return doc ? toClient(doc) : null;
  }

  async create(orgId: string, data: ClientInput): Promise<Client> {
    const doc = await ClientModel.create({ orgId, ...data });
    return toClient(doc.toObject() as ClientDoc);
  }

  async update(orgId: string, id: string, data: ClientInput): Promise<Client | null> {
    const doc = await ClientModel.findOneAndUpdate({ _id: id, orgId }, data, {
      new: true,
    }).lean<ClientDoc | null>();
    return doc ? toClient(doc) : null;
  }

  async deleteById(orgId: string, id: string): Promise<void> {
    await ClientModel.deleteOne({ _id: id, orgId });
  }
}

function toClient(doc: ClientDoc): Client {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    address: doc.address ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}
