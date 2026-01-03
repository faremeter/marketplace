// Mock for AWS Route53 client

export class MockRoute53Client {
  private healthCheckCounter = 0;

  async send(command: unknown): Promise<unknown> {
    const commandName = (command as { constructor: { name: string } })
      .constructor.name;

    switch (commandName) {
      case "CreateHealthCheckCommand":
        this.healthCheckCounter++;
        return {
          HealthCheck: {
            Id: `mock-hc-${this.healthCheckCounter}`,
          },
        };

      case "DeleteHealthCheckCommand":
        return {};

      case "ChangeResourceRecordSetsCommand":
        return {
          ChangeInfo: {
            Id: "mock-change-id",
            Status: "PENDING",
          },
        };

      case "ListResourceRecordSetsCommand":
        return {
          ResourceRecordSets: [],
          IsTruncated: false,
        };

      default:
        throw new Error(`Unmocked Route53 command: ${commandName}`);
    }
  }
}

// Factory to create client with custom behavior
export function createMockRoute53Client() {
  return new MockRoute53Client();
}
