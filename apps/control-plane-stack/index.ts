import { EC2 } from "./aws";
import { stackZones, addRecord, rootZone } from "./dns";
import { runner } from "@svmkit/pulumi-runner";
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const awsRegion = aws.getRegionOutput();

const APP_NAME = "control-plane";
const wgConfig = new pulumi.Config("wireguard");
const dbConfig = new pulumi.Config("database");
const walletConfig = new pulumi.Config("wallet");
const controlPlaneConfig = new pulumi.Config("controlPlane");
const uiConfig = new pulumi.Config("ui");

const allNodes = [];

const node = new EC2(`${APP_NAME}-api`);
allNodes.push(node);

addRecord(stackZones, "api", "A", [node.publicIp]);

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
