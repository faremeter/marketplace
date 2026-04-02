export const accounts = {
  data: [
    {
      id: 27,
      name: "test12345",
      created_at: "2025-12-31T21:16:28.671Z",
      grafana_dashboard_url: null,
      is_active: false,
      access_token: "2paks",
    },
    {
      id: 26,
      name: "elon",
      created_at: "2025-12-31T21:12:18.098Z",
      grafana_dashboard_url: null,
      is_active: true,
      access_token: "09bgm",
    },
  ],
  meta: {
    total: 27,
    limit: 5,
    offset: 0,
    has_more: true,
  },
};

export const trackedAddresses = {
  data: [
    {
      id: 37,
      account_id: 26,
      chain: "base",
      address: "0xCE3f744249b0DABD8D1806ED94076379A8E4c4f1",
      is_active: true,
      created_at: "2025-12-31T21:12:18.098Z",
    },
    {
      id: 5,
      account_id: 26,
      chain: "solana",
      address: "H68D5g3bTrc9KsGxrhhPbEdKUKDKUvxA9fZAb9PVJBKN",
      is_active: true,
      created_at: "2025-12-31T21:12:18.098Z",
    },
  ],
  meta: {
    total: 2,
    limit: 100,
    offset: 0,
    has_more: false,
  },
};

export const transactions = {
  data: [
    {
      id: 10909270,
      chain: "base",
      signature:
        "0x71afdfb32e48e8e15c8312d9f3a1ed225330ff55773f7a358bb2217fa140cf0e",
      block_time: "2026-01-05T21:08:49.000Z",
      from_address: "0x7F409e9c15d65b5D8aa418D5604e19d87e17dda9",
      to_address: "0xCE3f744249b0DABD8D1806ED94076379A8E4c4f1",
      amount: "10000",
      status: "finalized",
      direction: "fee",
      mint_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      tracked_address_id: 37,
      created_at: "2026-01-05T21:08:58.791Z",
    },
    {
      id: 10909269,
      chain: "base",
      signature:
        "0x71afdfb32e48e8e15c8312d9f3a1ed225330ff55773f7a358bb2217fa140cf0e",
      block_time: "2026-01-05T21:08:49.000Z",
      from_address: "0x7F409e9c15d65b5D8aa418D5604e19d87e17dda9",
      to_address: "0xCE3f744249b0DABD8D1806ED94076379A8E4c4f1",
      amount: "10000",
      status: "finalized",
      direction: "incoming",
      mint_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      tracked_address_id: 29,
      created_at: "2026-01-05T21:08:58.787Z",
    },
    {
      id: 10909274,
      chain: "solana",
      signature:
        "4iisnBffy39JoVK3zoZXJftcz7JHfDig3bJc5vAdWkDXuWGeKTaHjUthkbHveGTNe1qXwbbHdat4bdYSZ5FzpSkS",
      block_time: "2026-01-05T21:08:44.000Z",
      from_address: "da1CyoQRVj7zxf5qs9VxtQnCxi8AkgkaGVuUpAaYCsZ",
      to_address: "H68D5g3bTrc9KsGxrhhPbEdKUKDKUvxA9fZAb9PVJBKN",
      amount: "10000",
      status: "finalized",
      direction: "incoming",
      mint_address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tracked_address_id: 5,
      created_at: "2026-01-05T21:09:14.827Z",
    },
  ],
  meta: {
    total: 3,
    limit: 200,
    offset: 0,
    has_more: false,
  },
};

export const emptyResponse = {
  data: [],
  meta: {
    total: 0,
    limit: 50,
    offset: 0,
    has_more: false,
  },
};
