import { EC2 } from "./aws";
import { runner } from "@svmkit/pulumi-runner";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const nodeName = config.require("nodeName");
const nodeId = config.require("nodeId");

const wgConfig = new pulumi.Config("wireguard");
const cpConfig = new pulumi.Config("controlPlane");

const allNodes = [];

const node = new EC2(nodeName);
allNodes.push(node);

export const nodes = allNodes.map((x) => ({
  name: x.name,
  connection: x.connection,
  publicIp: x.publicIp,
}));

new runner.SSHDeployer(
  "setup-machine",
  {
    connection: node.connection,
    environment: {
      NODE_NAME: nodeName,
      NODE_ID: nodeId,
      WIREGUARD_PRIVATE_KEY: wgConfig.require("privateKey"),
      WIREGUARD_WG0_ADDRESS: wgConfig.require("address"),
      WIREGUARD_WG1_ADDRESS: wgConfig.require("multiAddress"),
      WIREGUARD_DASHBOARD_PUBKEY: wgConfig.require("dashboardPublicKey"),
      WIREGUARD_DASHBOARD_ENDPOINT: wgConfig.require("dashboardEndpoint"),
      CONTROL_PLANE_ADDRS: cpConfig.require("addresses"),
    },
    update: {
      payload: [
        runner.localFile({
          filename: "access.lua",
          localPath: "./assets/access.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "config-receiver.lua",
          localPath: "./assets/config-receiver.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "init-config.lua",
          localPath: "./assets/init-config.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "cert-installer.lua",
          localPath: "./assets/cert-installer.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "cert-deleter.lua",
          localPath: "./assets/cert-deleter.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "install-tenant-cert",
          localPath: "./assets/install-tenant-cert",
          mode: 0o755,
        }),
        runner.localFile({
          filename: "delete-tenant-cert",
          localPath: "./assets/delete-tenant-cert",
          mode: 0o755,
        }),
        runner.localFile({
          filename: "50_proxy.conf",
          localPath: "./assets/50_proxy.conf",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "setup-machine.opsh",
          localPath: "./assets/setup-machine.opsh",
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
