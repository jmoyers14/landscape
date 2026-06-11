import type {
  EstimateStatus,
  LineItemInput,
} from "../../data-access/repositories/EstimateRepository.ts";

export type {
  EstimateView,
  LineItemView,
  PhaseSummary,
  EstimateTotals,
} from "./calc.ts";
export type {
  EstimateStatus,
  LineItemInput,
  LineItemType,
} from "../../data-access/repositories/EstimateRepository.ts";

import type { EstimateView } from "./calc.ts";

/** Lightweight row for listing a project's estimates (with its grand total). */
export interface EstimateSummary {
  id: string;
  title: string;
  status: EstimateStatus;
  total: number;
  createdAt: string;
}

export interface UpdateEstimateMetaInput {
  title?: string;
  status?: EstimateStatus;
  overheadRate?: number;
  profitRate?: number;
  taxRate?: number;
}

export interface EstimateService {
  listByProject(orgId: string, projectId: string): Promise<EstimateSummary[]>;
  get(orgId: string, id: string): Promise<EstimateView | null>;
  create(orgId: string, projectId: string, title?: string): Promise<EstimateView>;
  updateMeta(
    orgId: string,
    id: string,
    input: UpdateEstimateMetaInput,
  ): Promise<EstimateView>;
  addLineItem(
    orgId: string,
    id: string,
    item: LineItemInput,
  ): Promise<EstimateView>;
  updateLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
    item: LineItemInput,
  ): Promise<EstimateView>;
  removeLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
  ): Promise<EstimateView>;
  remove(orgId: string, id: string): Promise<void>;
}
