import { describe, expect, it, mock } from "bun:test";
import { MaterialServiceImpl } from "./MaterialServiceImpl.ts";
import {
  makeAssemblyRepoMock,
  makeMaterialRepoMock,
} from "../../test-support/repoMocks.ts";
import { makeAssembly, makeMaterial } from "../../test-support/factories.ts";
import { ServiceError } from "../errors.ts";

const materialLine = (materialId: string) => ({
  key: "m",
  kind: "material" as const,
  description: "x",
  quantityFormula: "qty",
  materialId,
  deliveriesFormula: null,
  sortOrder: 0,
});

describe("MaterialServiceImpl", () => {
  it("trims input on create", async () => {
    const created = makeMaterial();
    const materials = makeMaterialRepoMock({
      create: mock(async () => created),
    });
    const service = new MaterialServiceImpl(materials, makeAssemblyRepoMock());

    await service.create(
      "org_1",
      makeMaterial({ name: "  Catch Basin  ", category: "  Drainage  " }),
    );

    const [, data] = (materials.create as ReturnType<typeof mock>).mock
      .calls[0];
    expect(data.name).toBe("Catch Basin");
    expect(data.category).toBe("Drainage");
  });

  it("throws NOT_FOUND when updating a missing material", async () => {
    const materials = makeMaterialRepoMock({ update: mock(async () => null) });
    const service = new MaterialServiceImpl(materials, makeAssemblyRepoMock());
    expect(
      service.update("org_1", "missing", makeMaterial()),
    ).rejects.toThrow(ServiceError);
  });

  it("blocks deleting a material an assembly references", async () => {
    const assemblies = makeAssemblyRepoMock({
      findByOrg: mock(async () => [
        makeAssembly({ name: "Drainage", lines: [materialLine("material_1")] }),
      ]),
    });
    const materials = makeMaterialRepoMock();
    const service = new MaterialServiceImpl(materials, assemblies);

    expect(service.remove("org_1", "material_1")).rejects.toThrow(ServiceError);
    expect(materials.deleteById).not.toHaveBeenCalled();
  });

  it("deletes a material no assembly references", async () => {
    const assemblies = makeAssemblyRepoMock({
      findByOrg: mock(async () => [
        makeAssembly({ lines: [materialLine("other_material")] }),
      ]),
    });
    const materials = makeMaterialRepoMock();
    const service = new MaterialServiceImpl(materials, assemblies);

    await service.remove("org_1", "material_1");
    expect(materials.deleteById).toHaveBeenCalledTimes(1);
  });
});
