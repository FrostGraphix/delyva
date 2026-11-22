import type { MyVendor } from '@delyva/contracts';

/** Port: vendor memberships of one user. */
export interface MyVendorsReader {
  /** Vendors the user owns or staffs, oldest membership first. */
  vendorsOf(userId: string): Promise<readonly MyVendor[]>;
}

/** Query: the vendors the caller may manage (vendor portal bootstrap, ADR 0820). */
export class ListMyVendors {
  /** @param reader membership reader */
  constructor(private readonly reader: MyVendorsReader) {}

  /** Executes the query; scoped to the caller's own user id (never a client-supplied id). */
  async execute(userId: string): Promise<{ items: MyVendor[] }> {
    return { items: [...(await this.reader.vendorsOf(userId))] };
  }
}
