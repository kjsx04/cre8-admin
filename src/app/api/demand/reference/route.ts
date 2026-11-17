import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/email/auth";
import { asBoolean, asNumber, asString, asStringList, DemandError } from "@/lib/demand/coerce";
import { jsonError, readJson } from "@/lib/demand/http";
import { listCategorySpacing, saveCategories, saveCategorySpacing, saveTiers } from "@/lib/demand/service";
import type { CategoryAdminView, TierAdminView } from "@/lib/demand/view";

export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await listCategorySpacing());
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    const category = asString(body.category) || "";
    if (!Object.prototype.hasOwnProperty.call(body, "spacingMiles")) {
      throw new DemandError("spacingMiles is required.", 400);
    }
    await saveCategorySpacing(category, asNumber(body.spacingMiles));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await readJson(request);
    if (Array.isArray(body.categories)) {
      const categories: CategoryAdminView[] = body.categories.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          category: asString(row.category) || "",
          formats: asStringList(row.formats),
          sfMin: asNumber(row.sfMin),
          sfMax: asNumber(row.sfMax),
          acresMin: asNumber(row.acresMin),
          acresMax: asNumber(row.acresMax),
          tierIds: asStringList(row.tierIds),
          driveThruTypical: asBoolean(row.driveThruTypical),
          spacingMiles: asNumber(row.spacingMiles),
        };
      });
      await saveCategories(categories.filter((row) => row.category));
    }
    if (Array.isArray(body.tiers)) {
      const tiers: TierAdminView[] = body.tiers.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          id: asString(row.id) || "",
          name: asString(row.name) || "",
          kind: row.kind === "acres" ? "acres" : "sf",
          minValue: asNumber(row.minValue),
          maxValue: asNumber(row.maxValue),
          sortOrder: asNumber(row.sortOrder) ?? 0,
        };
      });
      await saveTiers(tiers);
    }
    if (!Array.isArray(body.categories) && !Array.isArray(body.tiers)) {
      throw new DemandError("Send categories or tiers.", 400);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
