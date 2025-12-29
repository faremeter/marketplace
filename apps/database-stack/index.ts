import * as pulumi from "@pulumi/pulumi";
import { RDS } from "./rds";

const rdsConfig = new pulumi.Config("rds");

const vpcStack = new pulumi.StackReference(rdsConfig.require("vpcStackRef"));
const privateSubnetIds = vpcStack.getOutput(
  "privateSubnetIds",
) as pulumi.Output<string[]>;
const databaseSecurityGroupId = vpcStack.getOutput(
  "databaseSecurityGroupId",
) as pulumi.Output<string>;

const instanceClass = rdsConfig.get("instanceClass");
const allocatedStorage = rdsConfig.getNumber("allocatedStorage");

const db = new RDS("postgres", {
  subnetIds: privateSubnetIds,
  securityGroupId: databaseSecurityGroupId,
  dbName: rdsConfig.require("dbName"),
  masterUsername: rdsConfig.require("masterUsername"),
  masterPassword: rdsConfig.requireSecret("masterPassword"),
  ...(instanceClass && { instanceClass }),
  ...(allocatedStorage && { allocatedStorage }),
});

export const endpoint = db.endpoint;
export const port = db.port;
export const dbName = db.dbName;
