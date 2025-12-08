import type { Input } from "@pulumi/pulumi";

export type Connection = {
  user: Input<string>;
  host: Input<string>;
  privateKey: Input<string>;
};
