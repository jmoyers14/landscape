import type { EstimateStatus } from "../../data-access/repositories/EstimateRepository/EstimateRepository.ts";
export type {
  EstimateView,
  EstimateTotals,
  LineItemView,
  PhaseSummary,
} from "@landscape/core";
export type {
  EstimateStatus,
  EstimateAssembly,
  LineItemType,
} from "../../data-access/repositories/EstimateRepository/EstimateRepository.ts";

import type {
  Assembly,
  EstimateView,
  Material,
  PricingSettings,
} from "@landscape/core";

/**
 * The catalog snapshot the editor needs to recompute an estimate locally: the
 * org's assemblies (drivers + lines), every material those lines can reference,
 * and the pricing settings. With this in hand the client runs the same engine
 * the server does, so driver edits reprice instantly without a round-trip.
 */
export interface EstimateContext {
  assemblies: Assembly[];
  materials: Material[];
  pricing: PricingSettings;
}

/** Lightweight row for listing a project's estimates (with its grand total). */
export interface EstimateSummary {
  id: string;
  title: string;
  status: EstimateStatus;
  total: number;
  createdAt: string;
}

/** Meta a user can edit directly. Rates are snapshotted at generation, not here. */
export interface UpdateEstimateMetaInput {
  title?: string;
  status?: EstimateStatus;
}

/**
 * One assembly the estimate should include. `driverValues` overrides each
 * driver's default; omitted drivers fall back to the assembly's defaults.
 */
export interface SelectAssemblyInput {
  assemblyId: string;
  driverValues?: Record<string, number>;
}

export interface EstimateService {
  listByProject(orgId: string, projectId: string): Promise<EstimateSummary[]>;
  /**
   * The catalog snapshot (assemblies + materials + pricing) the editor prices
   * against for live recalculation. Read-only.
   */
  getContext(orgId: string): Promise<EstimateContext>;
  get(orgId: string, id: string): Promise<EstimateView | null>;
  create(
    orgId: string,
    projectId: string,
    title?: string,
  ): Promise<EstimateView>;
  updateMeta(
    orgId: string,
    id: string,
    input: UpdateEstimateMetaInput,
  ): Promise<EstimateView>;
  /**
   * Replace the estimate's chosen assemblies and regenerate its line-item
   * snapshot from the live catalog + pricing settings. Only permitted while the
   * estimate is a draft.
   */
  setAssemblies(
    orgId: string,
    id: string,
    selections: SelectAssemblyInput[],
  ): Promise<EstimateView>;
  remove(orgId: string, id: string): Promise<void>;
}
