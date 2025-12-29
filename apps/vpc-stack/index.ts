import * as pulumi from "@pulumi/pulumi";
import { VPC } from "./vpc";

const vpcConfig = new pulumi.Config("vpc");

const vpc = new VPC("main", {
  cidrBlock: vpcConfig.get("cidrBlock") ?? "172.16.0.0/16",
  azCount: vpcConfig.getNumber("azCount") ?? 2,
  enableNatGateway: vpcConfig.getBoolean("enableNatGateway") ?? true,
});

// Exports for other stacks to reference
export const vpcId = vpc.vpcId;
export const publicSubnetIds = pulumi.all(vpc.publicSubnetIds);
export const privateSubnetIds = pulumi.all(vpc.privateSubnetIds);
export const publicRouteTableId = vpc.publicRouteTableId;
export const privateRouteTableIds = pulumi.all(vpc.privateRouteTableIds);
export const controlPlaneSecurityGroupId = vpc.controlPlaneSecurityGroupId;
export const databaseSecurityGroupId = vpc.databaseSecurityGroupId;
