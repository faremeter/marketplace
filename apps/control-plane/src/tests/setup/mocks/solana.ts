// Mock for @solana/web3.js

export class MockPublicKey {
  constructor(public key: string) {}
  toString() {
    return this.key;
  }
  toBase58() {
    return this.key;
  }
}

export const mockConnection = {
  getBalance: async () => 1000000000, // 1 SOL in lamports
  getParsedTokenAccountsByOwner: async () => ({
    value: [
      {
        account: {
          data: {
            parsed: {
              info: {
                tokenAmount: { uiAmountString: "100.00" },
              },
            },
          },
        },
      },
    ],
  }),
  getLatestBlockhash: async () => ({
    blockhash: "mock-blockhash",
    lastValidBlockHeight: 12345,
  }),
};

// Factory to create connection with custom behavior
export function createMockConnection(
  overrides: Partial<typeof mockConnection> = {},
) {
  return { ...mockConnection, ...overrides };
}
