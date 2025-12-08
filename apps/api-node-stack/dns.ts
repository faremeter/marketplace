import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { RecordType } from "@pulumi/aws/route53";

const config = new pulumi.Config("dns");

const rootZoneName = config.require("rootZoneName");

export const rootZone = await aws.route53.getZone({ name: rootZoneName });

type Zoneish = {
  zoneId: pulumi.Input<string>;
  name: pulumi.Input<string>;
  nameServers: pulumi.Input<pulumi.Input<string>[]>;
};

const alternateZoneNames = config.getObject("alternateZoneNames") as
  | string[]
  | undefined;

export const alternateZones: Zoneish[] = [];

if (alternateZoneNames !== undefined) {
  const zones = await Promise.all(
    alternateZoneNames.map((name) => aws.route53.getZone({ name })),
  );

  alternateZones.push(...zones);
}

export let stackZones: Zoneish[];

if (config.getBoolean("useStackSubdomain")) {
  stackZones = [rootZone, ...alternateZones].flatMap((rootZone) => {
    const stackZoneName = `${pulumi.getStack()}.${rootZone.name}`;
    const zone = new aws.route53.Zone(stackZoneName, {
      name: stackZoneName,
    });

    addRecord([rootZone], stackZoneName, "NS", zone.nameServers);

    return zone;
  });
} else {
  stackZones = [rootZone, ...alternateZones];
}

export function addRecord(
  zones: Zoneish[],
  name: pulumi.Input<string>,
  type: RecordType,
  records: pulumi.Input<pulumi.Input<string>[]>,
) {
  const r = zones.map(
    (zone, i) =>
      new aws.route53.Record(
        `${type}-${name}-${i}`,
        {
          zoneId: zone.zoneId,
          name,
          type,
          ttl: 300,
          records,
        },
        {
          deleteBeforeReplace: true,
        },
      ),
  );

  return r;
}
