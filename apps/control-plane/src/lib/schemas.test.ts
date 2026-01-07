import t from "tap";
import { type } from "arktype";
import {
  SignupSchema,
  LoginSchema,
  CreateEndpointSchema,
  UpdateEndpointSchema,
  CreateTenantSchema,
  CreateOrganizationSchema,
  CreateWalletSchema,
  CreateNodeSchema,
  AddMemberSchema,
  WaitlistSchema,
  MAX_NAME_LENGTH,
  MAX_PRICE_USDC,
  MIN_PASSWORD_LENGTH,
} from "./schemas.js";

// Helper to check if result is an error
function isError(result: unknown): boolean {
  return result instanceof type.errors;
}

await t.test("SignupSchema", async (t) => {
  await t.test("accepts valid signup data", async (t) => {
    const result = SignupSchema({
      email: "test@example.com",
      password: "password123",
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects invalid email", async (t) => {
    const result = SignupSchema({
      email: "notanemail",
      password: "password123",
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects short password", async (t) => {
    const result = SignupSchema({
      email: "test@example.com",
      password: "short",
    });
    t.equal(isError(result), true);
  });

  await t.test(
    `requires password >= ${MIN_PASSWORD_LENGTH} chars`,
    async (t) => {
      const shortPass = SignupSchema({
        email: "test@example.com",
        password: "a".repeat(MIN_PASSWORD_LENGTH - 1),
      });
      t.equal(isError(shortPass), true);

      const exactPass = SignupSchema({
        email: "test@example.com",
        password: "a".repeat(MIN_PASSWORD_LENGTH),
      });
      t.equal(isError(exactPass), false);
    },
  );
});

await t.test("LoginSchema", async (t) => {
  await t.test("accepts valid login data", async (t) => {
    const result = LoginSchema({
      email: "test@example.com",
      password: "anypassword",
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects empty password", async (t) => {
    const result = LoginSchema({
      email: "test@example.com",
      password: "",
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects invalid email", async (t) => {
    const result = LoginSchema({
      email: "invalid",
      password: "password",
    });
    t.equal(isError(result), true);
  });
});

await t.test("CreateEndpointSchema", async (t) => {
  await t.test("accepts minimal valid data", async (t) => {
    const result = CreateEndpointSchema({ path: "/api/test" });
    t.equal(isError(result), false);
  });

  await t.test("accepts full valid data", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      price_usdc: 10000, // $0.01 in micro-USDC
      scheme: "per_request",
      description: "Test endpoint",
      priority: 10,
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects empty path", async (t) => {
    const result = CreateEndpointSchema({ path: "" });
    t.equal(isError(result), true);
  });

  await t.test("rejects invalid scheme", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      scheme: "invalid" as "per_request",
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects negative price", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      price_usdc: -1,
    });
    t.equal(isError(result), true);
  });

  await t.test(`rejects price > ${MAX_PRICE_USDC}`, async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      price_usdc: MAX_PRICE_USDC + 1,
    });
    t.equal(isError(result), true);
  });

  await t.test("accepts null price_usdc", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      price_usdc: null,
    });
    t.equal(isError(result), false);
  });

  await t.test("price_usdc edge cases", async (t) => {
    await t.test("accepts 0 (free)", async (t) => {
      const result = CreateEndpointSchema({
        path: "/api/test",
        price_usdc: 0,
      });
      t.equal(isError(result), false);
    });

    await t.test(`accepts ${MAX_PRICE_USDC} (max price)`, async (t) => {
      const result = CreateEndpointSchema({
        path: "/api/test",
        price_usdc: MAX_PRICE_USDC,
      });
      t.equal(isError(result), false);
    });

    await t.test("accepts fractional values", async (t) => {
      const result = CreateEndpointSchema({
        path: "/api/test",
        price_usdc: 0.5,
      });
      t.equal(isError(result), false);
    });
  });
});

await t.test("UpdateEndpointSchema", async (t) => {
  await t.test("accepts empty object (all optional)", async (t) => {
    const result = UpdateEndpointSchema({});
    t.equal(isError(result), false);
  });

  await t.test("accepts partial update", async (t) => {
    const result = UpdateEndpointSchema({
      price_usdc: 0.05,
      is_active: false,
    });
    t.equal(isError(result), false);
  });
});

await t.test("CreateTenantSchema", async (t) => {
  await t.test("accepts valid tenant data", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
    });
    t.equal(isError(result), false);
  });

  await t.test("accepts full tenant data", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      wallet_id: 1,
      default_price_usdc: 0.01,
      default_scheme: "per_request",
      upstream_auth_header: "Authorization",
      upstream_auth_value: "Bearer token",
      is_active: true,
      organization_id: 1,
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects empty name", async (t) => {
    const result = CreateTenantSchema({
      name: "",
      backend_url: "https://api.example.com",
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects invalid scheme", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      default_scheme: "invalid" as "per_request",
    });
    t.equal(isError(result), true);
  });

  await t.test("default_price_usdc edge cases", async (t) => {
    await t.test("accepts 0 (free)", async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price_usdc: 0,
      });
      t.equal(isError(result), false);
    });

    await t.test(`accepts ${MAX_PRICE_USDC} (max price)`, async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price_usdc: MAX_PRICE_USDC,
      });
      t.equal(isError(result), false);
    });

    await t.test(`rejects ${MAX_PRICE_USDC + 1} (over max)`, async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price_usdc: MAX_PRICE_USDC + 1,
      });
      t.equal(isError(result), true);
    });

    await t.test("rejects negative price", async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price_usdc: -1,
      });
      t.equal(isError(result), true);
    });
  });
});

await t.test("CreateOrganizationSchema", async (t) => {
  await t.test("accepts valid organization data", async (t) => {
    const result = CreateOrganizationSchema({ name: "My Org" });
    t.equal(isError(result), false);
  });

  await t.test("accepts with optional slug", async (t) => {
    const result = CreateOrganizationSchema({
      name: "My Org",
      slug: "my-org",
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects empty name", async (t) => {
    const result = CreateOrganizationSchema({ name: "" });
    t.equal(isError(result), true);
  });

  await t.test(`rejects name > ${MAX_NAME_LENGTH} chars`, async (t) => {
    const result = CreateOrganizationSchema({
      name: "a".repeat(MAX_NAME_LENGTH + 1),
    });
    t.equal(isError(result), true);
  });

  await t.test("accepts name with spaces and hyphens", async (t) => {
    const result = CreateOrganizationSchema({ name: "My Cool Org-Name" });
    t.equal(isError(result), false);
  });

  await t.test("rejects special characters", async (t) => {
    const result = CreateOrganizationSchema({ name: "My Org!" });
    t.equal(isError(result), true);
  });

  await t.test("rejects consecutive spaces", async (t) => {
    const result = CreateOrganizationSchema({ name: "My  Org" });
    t.equal(isError(result), true);
  });

  await t.test("rejects name starting with hyphen", async (t) => {
    const result = CreateOrganizationSchema({ name: "-My Org" });
    t.equal(isError(result), true);
  });

  await t.test("rejects name ending with hyphen", async (t) => {
    const result = CreateOrganizationSchema({ name: "My Org-" });
    t.equal(isError(result), true);
  });
});

await t.test("CreateWalletSchema", async (t) => {
  await t.test("accepts valid wallet data", async (t) => {
    const result = CreateWalletSchema({
      name: "My Wallet",
      wallet_config: { solana: {} },
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects empty name", async (t) => {
    const result = CreateWalletSchema({
      name: "",
      wallet_config: {},
    });
    t.equal(isError(result), true);
  });
});

await t.test("CreateNodeSchema", async (t) => {
  await t.test("accepts valid node data", async (t) => {
    const result = CreateNodeSchema({
      name: "node-1",
      internal_ip: "10.0.0.1",
    });
    t.equal(isError(result), false);
  });

  await t.test("accepts full node data", async (t) => {
    const result = CreateNodeSchema({
      name: "node-1",
      internal_ip: "10.0.0.1",
      public_ip: "1.2.3.4",
      status: "active",
      wireguard_public_key: "abc123",
      wireguard_address: "10.10.0.1",
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects invalid status", async (t) => {
    const result = CreateNodeSchema({
      name: "node-1",
      internal_ip: "10.0.0.1",
      status: "unknown" as "active",
    });
    t.equal(isError(result), true);
  });
});

await t.test("AddMemberSchema", async (t) => {
  await t.test("accepts valid member data", async (t) => {
    const result = AddMemberSchema({ email: "member@example.com" });
    t.equal(isError(result), false);
  });

  await t.test("accepts with role", async (t) => {
    const result = AddMemberSchema({
      email: "member@example.com",
      role: "admin",
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects invalid role", async (t) => {
    const result = AddMemberSchema({
      email: "member@example.com",
      role: "superuser" as "admin",
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects invalid email", async (t) => {
    const result = AddMemberSchema({ email: "notanemail" });
    t.equal(isError(result), true);
  });
});

await t.test("WaitlistSchema", async (t) => {
  await t.test("accepts valid email", async (t) => {
    const result = WaitlistSchema({ email: "user@example.com" });
    t.equal(isError(result), false);
  });

  await t.test("rejects invalid email", async (t) => {
    const result = WaitlistSchema({ email: "invalid" });
    t.equal(isError(result), true);
  });
});
