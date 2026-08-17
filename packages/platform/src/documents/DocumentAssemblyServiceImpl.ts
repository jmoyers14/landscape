import { inject, injectable } from "tsyringe";
import { computeEstimate, type Estimate } from "@landscape/domain";
import {
  CLIENT_REPOSITORY_TOKEN,
  COMPANY_PROFILE_REPOSITORY_TOKEN,
  ESTIMATE_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
} from "../data-access/tokens.ts";
import type { ClientRepository } from "../data-access/repositories/ClientRepository/ClientRepository.ts";
import type { CompanyProfileRepository } from "../data-access/repositories/CompanyProfileRepository/CompanyProfileRepository.ts";
import type { EstimateRepository } from "../data-access/repositories/EstimateRepository/EstimateRepository.ts";
import type { ProjectRepository } from "../data-access/repositories/ProjectRepository/ProjectRepository.ts";
import { OBJECT_STORAGE_TOKEN } from "../integrations/tokens.ts";
import type { ObjectStorage } from "../integrations/storage/ObjectStorage.ts";
import { LOGGER_TOKEN, type Logger } from "../logging/Logger.ts";
import type { DocumentAssemblyService } from "./DocumentAssemblyService.ts";
import { MissingEstimateError } from "./errors.ts";
import { roundCents } from "./keys.ts";
import {
  TAX_NOTE,
  type DocumentCompany,
  type DocumentParty,
  type DocumentProject,
  type EstimateDocument,
  type PartsOrderDocument,
  type PartsOrderLine,
} from "./types.ts";

/** Quantities are not money: three places, trailing noise from the formula engine trimmed. */
function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

@injectable()
export class DocumentAssemblyServiceImpl implements DocumentAssemblyService {
  constructor(
    @inject(ESTIMATE_REPOSITORY_TOKEN)
    private readonly estimates: EstimateRepository,
    @inject(PROJECT_REPOSITORY_TOKEN)
    private readonly projects: ProjectRepository,
    @inject(CLIENT_REPOSITORY_TOKEN)
    private readonly clients: ClientRepository,
    @inject(COMPANY_PROFILE_REPOSITORY_TOKEN)
    private readonly profiles: CompanyProfileRepository,
    @inject(OBJECT_STORAGE_TOKEN)
    private readonly storage: ObjectStorage,
    @inject(LOGGER_TOKEN)
    private readonly logger: Logger,
  ) {}

  async buildEstimateDocument(
    orgId: string,
    estimateId: string,
  ): Promise<EstimateDocument> {
    const estimate = await this.loadEstimate(orgId, estimateId);
    const view = computeEstimate(estimate);
    const { company, project, client } = await this.loadHeader(orgId, estimate);

    // Rows come straight off the engine's per-assembly buildup. Overhead (a
    // margin gross-up on materials) and profit are both linear in their bases,
    // so per-assembly totals sum to the job total exactly — no proportional
    // allocation, no largest-remainder reconciliation, and no possibility of
    // this column disagreeing with the screen.
    //
    // `assemblyTotals` is already grouped by sourceAssemblyId (never by
    // LineItem.phase, which holds the assembly NAME and would merge two
    // instances of one assembly and break on rename), ordered as the estimate
    // orders its assemblies, with a trailing "Other" row for lines that have no
    // source assembly. Every line therefore lands in exactly one row.
    const groups = view.assemblyTotals.map((assembly) => ({
      label: assembly.name,
      amount: roundCents(assembly.total),
    }));

    // The total is the sum of the ROUNDED rows, not the rounded sum, so a
    // customer adding the column always arrives at the printed total. The two
    // differ by at most a cent, and internal consistency is what a bid needs.
    const total = roundCents(groups.reduce((acc, row) => acc + row.amount, 0));

    return {
      company,
      client,
      project,
      title: estimate.title,
      createdAt: estimate.createdAt,
      groups,
      total,
      // No tax line: sales tax is computed per material line, pre-markup, and is
      // already inside every figure above. A subtotal → tax → total layout would
      // double-count it.
      taxNote: TAX_NOTE,
    };
  }

  async buildPartsOrderDocument(
    orgId: string,
    estimateId: string,
  ): Promise<PartsOrderDocument> {
    const estimate = await this.loadEstimate(orgId, estimateId);
    const { company, project } = await this.loadHeader(orgId, estimate);

    // Grouped by (description, unit, unitPrice) with quantities summed. Price is
    // part of the key on purpose: two lines with the same description at
    // different prices are genuinely different purchases and must stay apart.
    // Insertion order is preserved, which is generation order.
    const merged = new Map<string, PartsOrderLine>();
    let deliveryTotal = 0;

    for (const item of estimate.lineItems) {
      if (item.type !== "material") {
        continue;
      }
      // Delivery is a separately noted total rather than folded into unit
      // prices — a supplier quotes goods, and burying freight in a unit price
      // would misstate what is being ordered.
      deliveryTotal += item.deliveryCost;

      const key = `${item.description} ${item.unit ?? ""} ${item.unitPrice}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        continue;
      }
      merged.set(key, {
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        // A material line's unitPrice IS catalog cost: markup only ever happens
        // in aggregate, never per line. So this is correct by construction, not
        // by subtracting anything back out.
        unitPrice: item.unitPrice,
        lineTotal: 0,
      });
    }

    const lines = [...merged.values()].map((line) => {
      // lineTotal is computed from the ROUNDED quantity, the one actually
      // printed, so a supplier multiplying the row out always lands on the
      // figure beside it.
      const quantity = roundQuantity(line.quantity);
      return {
        ...line,
        quantity,
        lineTotal: roundCents(quantity * line.unitPrice),
      };
    });

    // Pre-tax: the supplier charges their own sales tax, so quoting ours here
    // would double it on their invoice.
    const subtotal = roundCents(
      lines.reduce((acc, line) => acc + line.lineTotal, 0),
    );
    const delivery = roundCents(deliveryTotal);

    return {
      company,
      project,
      title: estimate.title,
      createdAt: estimate.createdAt,
      lines,
      subtotal,
      deliveryTotal: delivery,
      total: roundCents(subtotal + delivery),
    };
  }

  private async loadEstimate(
    orgId: string,
    estimateId: string,
  ): Promise<Estimate> {
    const estimate = await this.estimates.findById(orgId, estimateId);
    if (!estimate) {
      // Org-scoped read: a cross-org id is indistinguishable from a missing one,
      // which is the point.
      throw new MissingEstimateError(estimateId);
    }
    return estimate;
  }

  /** The parts shared by both documents: who is sending it, and about what. */
  private async loadHeader(
    orgId: string,
    estimate: Estimate,
  ): Promise<{
    company: DocumentCompany;
    project: DocumentProject;
    client: DocumentParty | null;
  }> {
    const [profile, project] = await Promise.all([
      this.profiles.get(orgId),
      this.projects.findById(orgId, estimate.projectId),
    ]);

    const client = project
      ? await this.clients.findById(orgId, project.clientId)
      : null;

    return {
      company: {
        // A profile with no logo or an empty name still renders. A client-facing
        // document must not fail over missing branding.
        businessName: profile?.businessName ?? "",
        address: profile?.address ?? null,
        phone: profile?.phone ?? null,
        email: profile?.email ?? null,
        licenseNumber: profile?.licenseNumber ?? null,
        logo: await this.loadLogo(
          profile?.logoStorageKey ?? null,
          profile?.logoContentType ?? null,
        ),
      },
      project: {
        name: project?.name ?? estimate.title,
        location: project?.location ?? null,
      },
      client: client
        ? {
            name: client.name,
            address: client.address,
            email: client.email,
            phone: client.phone,
          }
        : null,
    };
  }

  private async loadLogo(
    key: string | null,
    contentType: string | null,
  ): Promise<DocumentCompany["logo"]> {
    if (!key || !contentType) {
      return null;
    }
    try {
      return { data: await this.storage.get(key), contentType };
    } catch (error) {
      // A missing or unreadable logo degrades the document; it does not fail it.
      this.logger.warn(
        { err: error, key },
        "logo unreadable; rendering without it",
      );
      return null;
    }
  }
}
