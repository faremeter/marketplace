import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as tls from "@pulumi/tls";

import type { Connection } from "./types";

const adminUsername = "admin";
const instanceType = "t3.2xlarge";
const instanceArch = "x86_64";

const nodeConfig = new pulumi.Config("node");

const amiId =
  nodeConfig.get("ami") ??
  pulumi.output(
    aws.ec2.getAmi({
      filters: [
        {
          name: "name",
          values: ["debian-13-*"],
        },
        {
          name: "architecture",
          values: [instanceArch],
        },
      ],
      owners: ["136693071363"], // Debian
      mostRecent: true,
    }),
  ).id;

export type EC2Args = {
  instanceType?: string;
  keyName?: string;
};

export class EC2 extends pulumi.ComponentResource {
  name: string;
  publicIp: pulumi.Output<string>;
  instance: aws.ec2.Instance;
  connection: Connection;
  constructor(
    name: string,
    args: EC2Args = {},
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super("ec2", name, {}, opts);
    this.name = name;

    const n = (...t: string[]) => {
      return [name, ...t].join("-");
    };

    const childInfo = pulumi.mergeOptions(opts, {
      parent: this,
    });

    const sshKey = new tls.PrivateKey(
      n("ssh-key"),
      {
        algorithm: "ED25519",
      },
      childInfo,
    );

    const keyPair = new aws.ec2.KeyPair(
      n("keypair"),
      {
        publicKey: sshKey.publicKeyOpenssh,
      },
      childInfo,
    );

    // IAM role for Route53 access
    const role = new aws.iam.Role(
      n("role"),
      {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Action: "sts:AssumeRole",
              Principal: { Service: "ec2.amazonaws.com" },
              Effect: "Allow",
            },
          ],
        }),
      },
      childInfo,
    );

    new aws.iam.RolePolicy(
      n("route53-policy"),
      {
        role: role.id,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "route53:GetChange",
                "route53:ChangeResourceRecordSets",
                "route53:ListResourceRecordSets",
                "route53:CreateHealthCheck",
                "route53:DeleteHealthCheck",
                "route53:GetHealthCheck",
                "route53:UpdateHealthCheck",
              ],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: [
                "route53:ListHostedZones",
                "route53:ListHostedZonesByName",
                "route53:ListHealthChecks",
              ],
              Resource: "*",
            },
          ],
        }),
      },
      childInfo,
    );

    const instanceProfile = new aws.iam.InstanceProfile(
      n("instance-profile"),
      { role: role.name },
      childInfo,
    );

    const securityGroup = new aws.ec2.SecurityGroup(n("sg"), {
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
    });

    this.instance = new aws.ec2.Instance(
      n("instance"),
      {
        ami: amiId,
        instanceType: args.instanceType ?? instanceType,
        keyName: keyPair.keyName,
        vpcSecurityGroupIds: [securityGroup.id],
        iamInstanceProfile: instanceProfile.name,
        rootBlockDevice: { volumeSize: 64 },
        tags: {
          Name: `${pulumi.getStack()}-${this.name}`,
        },
      },
      pulumi.mergeOptions(childInfo, { dependsOn: securityGroup }),
    );

    this.publicIp = this.instance.publicIp;
    this.connection = {
      user: adminUsername,
      host: this.instance.publicDns,
      privateKey: sshKey.privateKeyOpenssh,
    };
  }
}
