import t from "tap";
import { type } from "arktype";
import {
  SignupSchema,
  LoginSchema,
  CreateEndpointSchema,
  UpdateEndpointSchema,
  CreateTenantSchema,
  UpdateTenantSchema,
  CreateOrganizationSchema,
  CreateWalletSchema,
  CreateNodeSchema,
  AddMemberSchema,
  WaitlistSchema,
  AdminCreateTenantSchema,
  AdminUpdateTenantSchema,
  AdminUpdateEndpointSchema,
  MAX_NAME_LENGTH,
  MAX_PRICE,
  MIN_PASSWORD_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
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
      price: 10000, // $0.01 in micro-USDC
      scheme: "exact",
      description: "Test endpoint",
      priority: 10,
    });
    t.equal(isError(result), false);
  });

  await t.test("accepts valid http_method", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      http_method: "POST",
    });
    t.equal(isError(result), false);
  });

  await t.test("accepts ANY http_method", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      http_method: "ANY",
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects lowercase http_method", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      http_method: "get" as "GET",
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects empty path", async (t) => {
    const result = CreateEndpointSchema({ path: "" });
    t.equal(isError(result), true);
  });

  await t.test("rejects invalid scheme", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      scheme: "invalid" as "exact",
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects negative price", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      price: -1,
    });
    t.equal(isError(result), true);
  });

  await t.test(`rejects price > ${MAX_PRICE}`, async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      price: MAX_PRICE + 1,
    });
    t.equal(isError(result), true);
  });

  await t.test("accepts null price", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/test",
      price: null,
    });
    t.equal(isError(result), false);
  });

  await t.test("price edge cases", async (t) => {
    await t.test("accepts 0 (free)", async (t) => {
      const result = CreateEndpointSchema({
        path: "/api/test",
        price: 0,
      });
      t.equal(isError(result), false);
    });

    await t.test(`accepts ${MAX_PRICE} (max price)`, async (t) => {
      const result = CreateEndpointSchema({
        path: "/api/test",
        price: MAX_PRICE,
      });
      t.equal(isError(result), false);
    });

    await t.test("accepts fractional values", async (t) => {
      const result = CreateEndpointSchema({
        path: "/api/test",
        price: 0.5,
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
      price: 0.05,
      is_active: false,
    });
    t.equal(isError(result), false);
  });

  await t.test("accepts http_method update", async (t) => {
    const result = UpdateEndpointSchema({
      http_method: "DELETE",
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects invalid http_method", async (t) => {
    const result = UpdateEndpointSchema({
      http_method: "PATCH_ALL" as "PATCH",
    });
    t.equal(isError(result), true);
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
      default_price: 0.01,
      default_scheme: "exact",
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
      default_scheme: "invalid" as "exact",
    });
    t.equal(isError(result), true);
  });

  await t.test("default_price edge cases", async (t) => {
    await t.test("accepts 0 (free)", async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price: 0,
      });
      t.equal(isError(result), false);
    });

    await t.test(`accepts ${MAX_PRICE} (max price)`, async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price: MAX_PRICE,
      });
      t.equal(isError(result), false);
    });

    await t.test(`rejects ${MAX_PRICE + 1} (over max)`, async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price: MAX_PRICE + 1,
      });
      t.equal(isError(result), true);
    });

    await t.test("rejects negative price", async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        default_price: -1,
      });
      t.equal(isError(result), true);
    });
  });

  await t.test("accepts register_only flag", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      register_only: true,
    });
    t.equal(isError(result), false);
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

await t.test("Tags validation", async (t) => {
  await t.test("CreateTenantSchema accepts valid tags", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["production", "api", "v2"],
    });
    t.equal(isError(result), false);
  });

  await t.test("CreateTenantSchema accepts empty tags array", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: [],
    });
    t.equal(isError(result), false);
  });

  await t.test("CreateTenantSchema accepts tenant without tags", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
    });
    t.equal(isError(result), false);
  });

  await t.test("accepts tags with hyphens and underscores", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["my-tag", "another_tag", "tag-with_both"],
    });
    t.equal(isError(result), false);
  });

  await t.test("accepts tags with numbers", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["v1", "api2", "3rd-version"],
    });
    t.equal(isError(result), false);
  });

  await t.test(`rejects more than ${MAX_TAGS} tags`, async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
    });
    t.equal(isError(result), true);
  });

  await t.test(`accepts exactly ${MAX_TAGS} tags`, async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["tag1", "tag2", "tag3", "tag4", "tag5"],
    });
    t.equal(isError(result), false);
  });

  await t.test("rejects duplicate tags", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["production", "api", "production"],
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects empty tag string", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["valid", ""],
    });
    t.equal(isError(result), true);
  });

  await t.test(`rejects tag longer than ${MAX_TAG_LENGTH} chars`, async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["a".repeat(MAX_TAG_LENGTH + 1)],
    });
    t.equal(isError(result), true);
  });

  await t.test(
    `accepts tag with exactly ${MAX_TAG_LENGTH} chars`,
    async (t) => {
      const result = CreateTenantSchema({
        name: "my-tenant",
        backend_url: "https://api.example.com",
        tags: ["a".repeat(MAX_TAG_LENGTH)],
      });
      t.equal(isError(result), false);
    },
  );

  await t.test("rejects uppercase tags", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["Production"],
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects tags with spaces", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["my tag"],
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects tags with special characters", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["tag!"],
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects tags starting with hyphen", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["-invalid"],
    });
    t.equal(isError(result), true);
  });

  await t.test("rejects tags starting with underscore", async (t) => {
    const result = CreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["_invalid"],
    });
    t.equal(isError(result), true);
  });

  await t.test("UpdateTenantSchema accepts tags update", async (t) => {
    const result = UpdateTenantSchema({
      tags: ["updated", "tags"],
    });
    t.equal(isError(result), false);
  });

  await t.test("UpdateTenantSchema accepts empty tags to clear", async (t) => {
    const result = UpdateTenantSchema({
      tags: [],
    });
    t.equal(isError(result), false);
  });

  await t.test("AdminCreateTenantSchema accepts tags", async (t) => {
    const result = AdminCreateTenantSchema({
      name: "my-tenant",
      backend_url: "https://api.example.com",
      tags: ["admin", "managed"],
    });
    t.equal(isError(result), false);
  });

  await t.test("AdminUpdateTenantSchema accepts tags update", async (t) => {
    const result = AdminUpdateTenantSchema({
      tags: ["production", "critical"],
    });
    t.equal(isError(result), false);
  });

  await t.test("AdminUpdateTenantSchema rejects invalid tags", async (t) => {
    const result = AdminUpdateTenantSchema({
      tags: ["UPPERCASE"],
    });
    t.equal(isError(result), true);
  });
});

await t.test("Endpoint Tags validation", async (t) => {
  await t.test("CreateEndpointSchema accepts tags", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/users",
      tags: ["production", "api"],
    });
    t.equal(isError(result), false);
  });

  await t.test("CreateEndpointSchema accepts empty tags", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/users",
      tags: [],
    });
    t.equal(isError(result), false);
  });

  await t.test("CreateEndpointSchema accepts without tags", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/users",
    });
    t.equal(isError(result), false);
  });

  await t.test(
    `CreateEndpointSchema rejects more than ${MAX_TAGS} tags`,
    async (t) => {
      const result = CreateEndpointSchema({
        path: "/api/users",
        tags: ["t1", "t2", "t3", "t4", "t5", "t6"],
      });
      t.equal(isError(result), true);
    },
  );

  await t.test("CreateEndpointSchema rejects duplicate tags", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/users",
      tags: ["api", "api"],
    });
    t.equal(isError(result), true);
  });

  await t.test("CreateEndpointSchema rejects invalid tag format", async (t) => {
    const result = CreateEndpointSchema({
      path: "/api/users",
      tags: ["UPPERCASE"],
    });
    t.equal(isError(result), true);
  });

  await t.test("UpdateEndpointSchema accepts tags", async (t) => {
    const result = UpdateEndpointSchema({
      tags: ["updated", "tags"],
    });
    t.equal(isError(result), false);
  });

  await t.test(
    "UpdateEndpointSchema accepts empty tags to clear",
    async (t) => {
      const result = UpdateEndpointSchema({
        tags: [],
      });
      t.equal(isError(result), false);
    },
  );

  await t.test("AdminUpdateEndpointSchema accepts tags", async (t) => {
    const result = AdminUpdateEndpointSchema({
      tags: ["admin", "managed"],
    });
    t.equal(isError(result), false);
  });

  await t.test("AdminUpdateEndpointSchema rejects invalid tags", async (t) => {
    const result = AdminUpdateEndpointSchema({
      tags: ["Invalid Tag!"],
    });
    t.equal(isError(result), true);
  });
});
