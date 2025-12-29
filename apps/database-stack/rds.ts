import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export type RDSArgs = {
  subnetIds: pulumi.Input<string[]>;
  securityGroupId: pulumi.Input<string>;
  instanceClass?: string;
  allocatedStorage?: number;
  dbName: string;
  masterUsername: string;
  masterPassword: pulumi.Input<string>;
};

export class RDS extends pulumi.ComponentResource {
  name: string;
  endpoint: pulumi.Output<string>;
  port: pulumi.Output<number>;
  dbName: pulumi.Output<string>;

  constructor(
    name: string,
    args: RDSArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    super("rds", name, {}, opts);
    this.name = name;

    const n = (...t: string[]) => {
      return [name, ...t].join("-");
    };

    const childInfo = pulumi.mergeOptions(opts, {
      parent: this,
    });

    const dbSubnetGroup = new aws.rds.SubnetGroup(
      n("subnet-group"),
      {
        subnetIds: args.subnetIds,
        tags: {
          Name: n("subnet-group"),
        },
      },
      childInfo,
    );

    const dbInstance = new aws.rds.Instance(
      n("instance"),
      {
        allocatedStorage: args.allocatedStorage ?? 20,
        storageType: "gp3",
        engine: "postgres",
        engineVersion: "16",
        instanceClass: args.instanceClass ?? "db.t3.medium",
        dbName: args.dbName,
        username: args.masterUsername,
        password: args.masterPassword,
        dbSubnetGroupName: dbSubnetGroup.name,
        vpcSecurityGroupIds: [args.securityGroupId],
        publiclyAccessible: false,
        multiAz: true,
        skipFinalSnapshot: true,
        deletionProtection: false,
        backupRetentionPeriod: 7,
        backupWindow: "03:00-04:00",
        maintenanceWindow: "Mon:04:00-Mon:05:00",
        autoMinorVersionUpgrade: true,
        storageEncrypted: true,
        tags: {
          Name: `${pulumi.getStack()}-${name}`,
        },
      },
      pulumi.mergeOptions(childInfo, {
        dependsOn: [dbSubnetGroup],
      }),
    );

    this.endpoint = dbInstance.address;
    this.port = dbInstance.port;
    this.dbName = pulumi.output(args.dbName);
  }
}
