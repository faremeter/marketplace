import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export type VPCArgs = {
  cidrBlock?: string;
  azCount?: number;
  enableNatGateway?: boolean;
};

export class VPC extends pulumi.ComponentResource {
  name: string;
  vpcId: pulumi.Output<string>;
  publicSubnetIds: pulumi.Output<string>[];
  privateSubnetIds: pulumi.Output<string>[];
  publicRouteTableId: pulumi.Output<string>;
  privateRouteTableIds: pulumi.Output<string>[];
  controlPlaneSecurityGroupId: pulumi.Output<string>;
  databaseSecurityGroupId: pulumi.Output<string>;

  constructor(
    name: string,
    args: VPCArgs = {},
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super("vpc", name, {}, opts);
    this.name = name;

    const n = (...t: string[]) => {
      return [name, ...t].join("-");
    };

    const childInfo = pulumi.mergeOptions(opts, {
      parent: this,
    });

    const cidrBlock = args.cidrBlock ?? "172.16.0.0/16";
    const azCount = args.azCount ?? 2;
    const enableNatGateway = args.enableNatGateway ?? true;

    const availableAzs = aws.getAvailabilityZones({
      state: "available",
    });

    const vpc = new aws.ec2.Vpc(
      n("vpc"),
      {
        cidrBlock,
        enableDnsHostnames: true,
        enableDnsSupport: true,
        tags: {
          Name: n("vpc"),
        },
      },
      childInfo,
    );

    this.vpcId = vpc.id;

    const igw = new aws.ec2.InternetGateway(
      n("igw"),
      {
        vpcId: vpc.id,
        tags: {
          Name: n("igw"),
        },
      },
      childInfo,
    );

    const publicRouteTable = new aws.ec2.RouteTable(
      n("public-rt"),
      {
        vpcId: vpc.id,
        routes: [
          {
            cidrBlock: "0.0.0.0/0",
            gatewayId: igw.id,
          },
        ],
        tags: {
          Name: n("public-rt"),
        },
      },
      childInfo,
    );

    this.publicRouteTableId = publicRouteTable.id;

    this.publicSubnetIds = [];
    this.privateSubnetIds = [];
    this.privateRouteTableIds = [];

    const natGateways: aws.ec2.NatGateway[] = [];

    for (let i = 0; i < azCount; i++) {
      const azName = pulumi.output(availableAzs).apply((azs) => {
        const name = azs.names[i];
        if (!name) {
          throw new Error(`Availability zone ${i} not found`);
        }
        return name;
      });
      const azSuffix = String.fromCharCode(97 + i); // a, b, c...

      const publicSubnet = new aws.ec2.Subnet(
        n(`public-${azSuffix}`),
        {
          vpcId: vpc.id,
          cidrBlock: `172.16.${i + 1}.0/24`,
          availabilityZone: azName,
          mapPublicIpOnLaunch: true,
          tags: {
            Name: n(`public-${azSuffix}`),
            Type: "public",
          },
        },
        childInfo,
      );

      this.publicSubnetIds.push(publicSubnet.id);

      new aws.ec2.RouteTableAssociation(
        n(`public-rta-${azSuffix}`),
        {
          subnetId: publicSubnet.id,
          routeTableId: publicRouteTable.id,
        },
        childInfo,
      );

      const privateSubnet = new aws.ec2.Subnet(
        n(`private-${azSuffix}`),
        {
          vpcId: vpc.id,
          cidrBlock: `172.16.${i + 10}.0/24`,
          availabilityZone: azName,
          tags: {
            Name: n(`private-${azSuffix}`),
            Type: "private",
          },
        },
        childInfo,
      );

      this.privateSubnetIds.push(privateSubnet.id);

      if (enableNatGateway && i === 0) {
        const eip = new aws.ec2.Eip(
          n(`nat-eip-${azSuffix}`),
          {
            domain: "vpc",
            tags: {
              Name: n(`nat-eip-${azSuffix}`),
            },
          },
          childInfo,
        );

        const natGateway = new aws.ec2.NatGateway(
          n(`nat-${azSuffix}`),
          {
            allocationId: eip.id,
            subnetId: publicSubnet.id,
            tags: {
              Name: n(`nat-${azSuffix}`),
            },
          },
          pulumi.mergeOptions(childInfo, { dependsOn: [igw] }),
        );

        natGateways.push(natGateway);
      }

      const privateRouteTableArgs: aws.ec2.RouteTableArgs = {
        vpcId: vpc.id,
        tags: {
          Name: n(`private-rt-${azSuffix}`),
        },
      };

      const natGateway = natGateways[0];
      if (enableNatGateway && natGateway) {
        privateRouteTableArgs.routes = [
          {
            cidrBlock: "0.0.0.0/0",
            natGatewayId: natGateway.id,
          },
        ];
      }

      const privateRouteTable = new aws.ec2.RouteTable(
        n(`private-rt-${azSuffix}`),
        privateRouteTableArgs,
        childInfo,
      );

      this.privateRouteTableIds.push(privateRouteTable.id);

      new aws.ec2.RouteTableAssociation(
        n(`private-rta-${azSuffix}`),
        {
          subnetId: privateSubnet.id,
          routeTableId: privateRouteTable.id,
        },
        childInfo,
      );
    }

    const controlPlaneSg = new aws.ec2.SecurityGroup(
      n("control-plane-sg"),
      {
        vpcId: vpc.id,
        description: "Security group for control-plane EC2",
        ingress: [
          {
            protocol: "tcp",
            fromPort: 22,
            toPort: 22,
            cidrBlocks: ["0.0.0.0/0"],
          },
          {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ["0.0.0.0/0"],
          },
          {
            protocol: "tcp",
            fromPort: 443,
            toPort: 443,
            cidrBlocks: ["0.0.0.0/0"],
          },
          {
            protocol: "udp",
            fromPort: 51821,
            toPort: 51821,
            cidrBlocks: ["0.0.0.0/0"],
          },
        ],
        egress: [
          {
            protocol: "-1",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
          },
        ],
        tags: {
          Name: n("control-plane-sg"),
        },
      },
      childInfo,
    );

    this.controlPlaneSecurityGroupId = controlPlaneSg.id;

    const databaseSg = new aws.ec2.SecurityGroup(
      n("database-sg"),
      {
        vpcId: vpc.id,
        description: "Security group for RDS database",
        ingress: [
          {
            protocol: "tcp",
            fromPort: 5432,
            toPort: 5432,
            securityGroups: [controlPlaneSg.id],
          },
        ],
        egress: [],
        tags: {
          Name: n("database-sg"),
        },
      },
      childInfo,
    );

    this.databaseSecurityGroupId = databaseSg.id;
  }
}
