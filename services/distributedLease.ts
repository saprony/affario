import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getSupabaseServerClient } from "@/services/supabaseServer";

const RESOURCE_KEY_HASH_DOMAIN = "affario:distributed-lease:resource:v1";
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const OWNER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type DistributedLease = {
  resourceType: string;
  resourceKeyHash: string;
  ownerToken: string;
};

export type DistributedLeaseClaimResult =
  | { status: "acquired"; lease: DistributedLease }
  | { status: "contended" };

type DistributedLeaseRpc = (
  functionName: string,
  parameters: Record<string, unknown>
) => Promise<unknown>;

type DistributedLeaseServiceDependencies = {
  callRpc: DistributedLeaseRpc;
  createOwnerToken: () => string;
};

export class DistributedLeaseStoreError extends Error {
  constructor() {
    super("Distributed lease store is unavailable.");
    this.name = "DistributedLeaseStoreError";
  }
}

function validateResource(resourceType: string, resourceKey: string): void {
  if (
    !RESOURCE_TYPE_PATTERN.test(resourceType) ||
    resourceKey.length === 0 ||
    resourceKey.length > 512
  ) {
    throw new Error("Invalid distributed lease resource.");
  }
}

export function hashDistributedLeaseResourceKey(
  resourceType: string,
  resourceKey: string
): string {
  validateResource(resourceType, resourceKey);

  return createHash("sha256")
    .update(RESOURCE_KEY_HASH_DOMAIN, "utf8")
    .update("\0", "utf8")
    .update(resourceType, "utf8")
    .update("\0", "utf8")
    .update(resourceKey, "utf8")
    .digest("hex");
}

export function createDistributedLeaseService(
  dependencies: DistributedLeaseServiceDependencies
) {
  return {
    async tryClaim(input: {
      resourceType: string;
      resourceKey: string;
      leaseSeconds: number;
    }): Promise<DistributedLeaseClaimResult> {
      validateResource(input.resourceType, input.resourceKey);

      if (
        !Number.isSafeInteger(input.leaseSeconds) ||
        input.leaseSeconds < 1 ||
        input.leaseSeconds > 3_600
      ) {
        throw new Error("Invalid distributed lease duration.");
      }

      const ownerToken = dependencies.createOwnerToken();

      if (!OWNER_TOKEN_PATTERN.test(ownerToken)) {
        throw new Error("Invalid distributed lease owner token.");
      }

      const resourceKeyHash = hashDistributedLeaseResourceKey(
        input.resourceType,
        input.resourceKey
      );
      let claimed: unknown;

      try {
        claimed = await dependencies.callRpc(
          "affario_try_claim_distributed_lease",
          {
            p_resource_type: input.resourceType,
            p_resource_key: resourceKeyHash,
            p_owner_token: ownerToken,
            p_lease_seconds: input.leaseSeconds,
          }
        );
      } catch {
        throw new DistributedLeaseStoreError();
      }

      if (typeof claimed !== "boolean") {
        throw new DistributedLeaseStoreError();
      }

      return claimed
        ? {
            status: "acquired",
            lease: {
              resourceType: input.resourceType,
              resourceKeyHash,
              ownerToken,
            },
          }
        : { status: "contended" };
    },

    async release(lease: DistributedLease): Promise<boolean> {
      if (
        !RESOURCE_TYPE_PATTERN.test(lease.resourceType) ||
        !/^[a-f0-9]{64}$/.test(lease.resourceKeyHash) ||
        !OWNER_TOKEN_PATTERN.test(lease.ownerToken)
      ) {
        throw new Error("Invalid distributed lease.");
      }

      let released: unknown;

      try {
        released = await dependencies.callRpc(
          "affario_release_distributed_lease",
          {
            p_resource_type: lease.resourceType,
            p_resource_key: lease.resourceKeyHash,
            p_owner_token: lease.ownerToken,
          }
        );
      } catch {
        throw new DistributedLeaseStoreError();
      }

      if (typeof released !== "boolean") {
        throw new DistributedLeaseStoreError();
      }

      return released;
    },
  };
}

const productionDistributedLeaseService = createDistributedLeaseService({
  async callRpc(functionName, parameters) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc(functionName, parameters);

    if (error) {
      throw new Error("Distributed lease RPC failed.");
    }

    return data;
  },
  createOwnerToken: () => randomBytes(32).toString("base64url"),
});

export const tryClaimDistributedLease =
  productionDistributedLeaseService.tryClaim;
export const releaseDistributedLease =
  productionDistributedLeaseService.release;
