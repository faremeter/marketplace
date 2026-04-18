import { EC2 } from "./aws";
import { proxyBaseDomain, proxyAltDomains } from "./dns";
import { runner } from "@svmkit/pulumi-runner";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const nodeName = config.require("nodeName");
const nodeId = config.require("nodeId");

const wgConfig = new pulumi.Config("wireguard");
const cpConfig = new pulumi.Config("controlPlane");
const facilitatorConfig = new pulumi.Config("facilitator");

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
      CONTROL_PLANE_WG_PEERS: cpConfig.require("wgPeers"),
      PROXY_BASE_DOMAIN: proxyBaseDomain,
      PROXY_ALT_DOMAINS: proxyAltDomains,
      FACILITATOR_URL: facilitatorConfig.require("url"),
    },
    update: {
      payload: [
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
          filename: "faremeter-sidecar.service",
          localPath: "./assets/faremeter-sidecar.service",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "regen-tenant-nginx",
          localPath: "./assets/regen-tenant-nginx",
          mode: 0o755,
        }),
        runner.localFile({
          filename: "reload-faremeter-sidecar",
          localPath: "./assets/reload-faremeter-sidecar",
          mode: 0o755,
        }),
        runner.localFile({
          filename: "pull-tenant-config",
          localPath: "./assets/pull-tenant-config",
          mode: 0o755,
        }),
        runner.localFile({
          filename: "control-plane-client.lua",
          localPath: "./assets/control-plane-client.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "free-recording.lua",
          localPath: "./assets/free-recording.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "upstream-auth.lua",
          localPath: "./assets/upstream-auth.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "tenant-request.lua",
          localPath: "./assets/tenant-request.lua",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "free-fallback.conf.inc",
          localPath: "./assets/free-fallback.conf.inc",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "sidecar-main.js",
          localPath: "./sidecar/dist/main.js",
          mode: 0o644,
        }),
        runner.localFile({
          filename: "setup-machine.opsh",
          localPath: "./assets/setup-machine.opsh",
          mode: 0o755,
        }),
      ],
      command:
        "sudo PATH=$PWD:$PATH:/usr/sbin:/sbin ./setup-machine.opsh || true",
    },
  },
  {
    dependsOn: [node],
  },
);
