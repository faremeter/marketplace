// Mock for @solana/kit RPC client

export const mockRpc = {
  getBalance: (_addr: string) => ({
    send: async () => ({ value: 1000000000n }), // 1 SOL in lamports
  }),
  getTokenAccountsByOwner: (
    _owner: string,
    _filter: unknown,
    _config?: unknown,
  ) => ({
    send: async () => ({
      value: [
        {
          account: {
            data: {
              parsed: {
                info: {
                  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                  tokenAmount: {
                    uiAmount: 100,
                    uiAmountString: "100.00",
                  },
                },
              },
            },
          },
        },
      ],
    }),
  }),
};

// Factory to create RPC mock with custom behavior
export function createMockRpc(overrides: Partial<typeof mockRpc> = {}) {
  return { ...mockRpc, ...overrides };
}
