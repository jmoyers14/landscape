import { injectable } from "tsyringe";
import {
  PricingSettingsModel,
  type PricingSettingsDoc,
} from "../../models/PricingSettings.ts";
import type {
  PricingSettings,
  PricingSettingsRepository,
} from "./PricingSettingsRepository.ts";

/**
 * Mongoose-backed pricing settings — one document per org. `upsert` creates the
 * document on first save so callers never special-case "no settings yet".
 */
@injectable()
export class PricingSettingsRepositoryImpl implements PricingSettingsRepository {
  async get(orgId: string): Promise<PricingSettings | null> {
    const doc = await PricingSettingsModel.findOne({ orgId }).lean();
    return doc ? toSettings(doc) : null;
  }

  async upsert(orgId: string, settings: PricingSettings): Promise<PricingSettings> {
    const doc = await PricingSettingsModel.findOneAndUpdate(
      { orgId },
      { orgId, ...settings },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return toSettings(doc);
  }
}

function toSettings(doc: PricingSettingsDoc): PricingSettings {
  return {
    taxRate: doc.taxRate,
    overheadRate: doc.overheadRate,
    profitRate: doc.profitRate,
    laborRates: (doc.laborRates ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      rate: r.rate,
    })),
  };
}
