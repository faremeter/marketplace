import { EC2 } from "./aws";
import {
  stackZones,
  rootZone,
  proxyBaseDomain,
  proxyAltDomains,
  createHealthCheck,
  addWeightedRecord,
} from "./dns";
import { runner } from "@svmkit/pulumi-runner";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const awsRegion = aws.getRegionOutput();

const APP_NAME = "control-plane";
const vpcConfig = new pulumi.Config("vpc");
const wgConfig = new pulumi.Config("wireguard");
const dbConfig = new pulumi.Config("database");
const walletConfig = new pulumi.Config("wallet");
const controlPlaneConfig = new pulumi.Config("controlPlane");
const uiConfig = new pulumi.Config("ui");
const facilitatorConfig = new pulumi.Config("facilitator");
const corbitsDashConfig = new pulumi.Config("corbitsDashboard");
const attioConfig = new pulumi.Config("attio");

const vpcStack = new pulumi.StackReference(vpcConfig.require("stackRef"));
const publicSubnetIds = vpcStack.getOutput("publicSubnetIds") as pulumi.Output<
  string[]
>;
const controlPlaneSecurityGroupId = vpcStack.getOutput(
  "controlPlaneSecurityGroupId",
) as pulumi.Output<string>;

const nodeId = controlPlaneConfig.require("nodeId");

const allNodes = [];

const node = new EC2(`${APP_NAME}-api`, {
  subnetId: publicSubnetIds.apply((ids) => {
    const id = ids[0];
    if (!id) {
      throw new Error("No public subnet found");
    }
    return id;
  }),
  securityGroupId: controlPlaneSecurityGroupId,
});
allNodes.push(node);

const healthCheck = createHealthCheck(
  `${APP_NAME}-health-${nodeId}`,
  node.publicIp,
  443,
  "/health",
);

addWeightedRecord(stackZones, "api", nodeId, node.publicIp, healthCheck.id);

export const nodes = allNodes.map((x) => ({
  name: x.name,
  connection: x.connection,
}));

new runner.SSHDeployer(
  "setup-machine",
  {
    connection: node.connection,
    environment: {
      APP_NAME,
      AWS_REGION: awsRegion.name,
      WIREGUARD_PRIVATE_KEY: wgConfig.require("privateKey"),
      WIREGUARD_WG0_ADDRESS: wgConfig.require("address"),
      WIREGUARD_WG1_ADDRESS: wgConfig.require("multiAddress"),
      WIREGUARD_WG1_PEERS: wgConfig.get("multiPeers") ?? "",
      DATABASE_HOST: dbConfig.require("host"),
      DATABASE_PORT: dbConfig.require("port"),
      DATABASE_NAME: dbConfig.require("name"),
      DATABASE_USER: dbConfig.require("user"),
      DATABASE_PASSWORD: dbConfig.requireSecret("password"),
      WALLET_ENCRYPTION_KEY: walletConfig.requireSecret("encryptionKey"),
      CONTROL_PLANE_PORT: controlPlaneConfig.require("port"),
      UI_PORT: uiConfig.require("port"),
      ROUTE53_ZONE_ID: rootZone.zoneId,
      WIREGUARD_DASHBOARD_PUBKEY: wgConfig.require("dashboardPublicKey"),
      WIREGUARD_DASHBOARD_ENDPOINT: wgConfig.require("dashboardEndpoint"),
      CORBITS_DASH_API_KEY: corbitsDashConfig.getSecret("apiKey") ?? "",
      CORBITS_DASH_API_URL: corbitsDashConfig.get("apiUrl") ?? "",
      ATTIO_API_KEY: attioConfig.getSecret("apiKey") ?? "",
      ATTIO_LIST_ID: attioConfig.get("listId") ?? "",
      PROXY_BASE_DOMAIN: proxyBaseDomain,
      PROXY_ALT_DOMAINS: proxyAltDomains,
      FACILITATOR_URL: facilitatorConfig.require("url"),
      WIREGUARD_DASHBOARD_ENDPOINT: wgConfig.require("dashboardEndpoint"),
    },
    update: {
      payload: [
        runner.localFile({
          filename: "setup-machine.opsh",
          localPath: "./assets/setup-machine.opsh",
          mode: 0o755,
        }),
        runner.localFile({
          filename: "50_control_plane.conf",
          localPath: "./assets/50_control_plane.conf",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "control_plane.service",
          localPath: "./assets/control_plane.service",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "wg-peers.service",
          localPath: "./assets/wg-peers.service",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "regen-wg-peers",
          localPath: "./assets/regen-wg-peers",
          mode: 0o755,
        }),
        runner.localFile({
          filename: "read-tenant-cert",
          localPath: "./assets/read-tenant-cert",
          mode: 0o755,
        }),
      ],
      command: "sudo PATH=$PWD:$PATH:/usr/sbin:/sbin ./setup-machine.opsh",
    },
  },
  {
    dependsOn: [node],
  },
);
