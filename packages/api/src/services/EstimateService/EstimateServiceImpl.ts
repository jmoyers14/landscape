import { inject, injectable } from "tsyringe";
import {
  ESTIMATE_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
} from "../../data-access/tokens.ts";
import type {
  EstimateRepository,
  LineItemInput,
} from "../../data-access/repositories/EstimateRepository/EstimateRepository.ts";
import type { ProjectRepository } from "../../data-access/repositories/ProjectRepository/ProjectRepository.ts";
import { ServiceError } from "../errors.ts";
import { computeEstimate, type EstimateView } from "../../engine/calc.ts";
import type {
  EstimateService,
  EstimateSummary,
  UpdateEstimateMetaInput,
} from "./EstimateService.ts";

// Defaults for a fresh estimate. These will move to OrgSettings later so each
// business can set its own house rates.
const DEFAULT_OVERHEAD = 40;
const DEFAULT_PROFIT = 15;
const DEFAULT_TAX = 0;

/**
 * Estimate business logic: validates the parent project, defaults a new
 * estimate's rates/title, and runs every read/mutation through the calc engine
 * so callers always get freshly computed totals. Orchestrates two repositories.
 */
@injectable()
export class EstimateServiceImpl implements EstimateService {
  constructor(
    @inject(ESTIMATE_REPOSITORY_TOKEN)
    private readonly estimates: EstimateRepository,
    @inject(PROJECT_REPOSITORY_TOKEN)
    private readonly projects: ProjectRepository,
  ) {}

  async listByProject(
    orgId: string,
    projectId: string,
  ): Promise<EstimateSummary[]> {
    const estimates = await this.estimates.findByProject(orgId, projectId);
    return estimates.map((estimate) => {
      const { totals } = computeEstimate(estimate);
      return {
        id: estimate.id,
        title: estimate.title,
        status: estimate.status,
        total: totals.total,
        createdAt: estimate.createdAt,
      };
    });
  }

  async get(orgId: string, id: string): Promise<EstimateView | null> {
    const estimate = await this.estimates.findById(orgId, id);
    return estimate ? computeEstimate(estimate) : null;
  }

  async create(
    orgId: string,
    projectId: string,
    title?: string,
  ): Promise<EstimateView> {
    const project = await this.projects.findById(orgId, projectId);
    if (!project) {
      throw new ServiceError("BAD_REQUEST", "Project does not exist");
    }

    let resolvedTitle = title?.trim();
    if (!resolvedTitle) {
      const existing = await this.estimates.findByProject(orgId, projectId);
      resolvedTitle = `Estimate ${existing.length + 1}`;
    }

    const estimate = await this.estimates.create(orgId, {
      projectId,
      title: resolvedTitle,
      status: "draft",
      overheadRate: DEFAULT_OVERHEAD,
      profitRate: DEFAULT_PROFIT,
      taxRate: DEFAULT_TAX,
    });
    return computeEstimate(estimate);
  }

  async updateMeta(
    orgId: string,
    id: string,
    input: UpdateEstimateMetaInput,
  ): Promise<EstimateView> {
    const estimate = await this.estimates.updateMeta(orgId, id, input);
    return this.requireView(estimate);
  }

  async addLineItem(
    orgId: string,
    id: string,
    item: LineItemInput,
  ): Promise<EstimateView> {
    const estimate = await this.estimates.addLineItem(orgId, id, item);
    return this.requireView(estimate);
  }

  async updateLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
    item: LineItemInput,
  ): Promise<EstimateView> {
    const estimate = await this.estimates.updateLineItem(
      orgId,
      id,
      lineItemId,
      item,
    );
    return this.requireView(estimate);
  }

  async removeLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
  ): Promise<EstimateView> {
    const estimate = await this.estimates.removeLineItem(orgId, id, lineItemId);
    return this.requireView(estimate);
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.estimates.deleteById(orgId, id);
  }

  private requireView(
    estimate: Parameters<typeof computeEstimate>[0] | null,
  ): EstimateView {
    if (!estimate) {
      throw new ServiceError("NOT_FOUND", "Estimate not found");
    }
    return computeEstimate(estimate);
  }
}
