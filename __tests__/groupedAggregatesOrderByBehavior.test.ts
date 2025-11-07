import { Pool } from "pg";
import { makeSchema } from "postgraphile";
import { makePgService } from "postgraphile/adaptors/pg";
import type { GraphQLEnumType } from "graphql";
import { PostGraphileAmberPreset } from "postgraphile/presets/amber";
import { PostGraphileConnectionFilterPreset } from "postgraphile-plugin-connection-filter";
import { PgAggregatesPreset } from "../dist/index.js";

let pool: Pool | undefined;

afterEach(() => {
  if (pool) {
    pool.end();
    pool = undefined;
  }
});

async function getSchemaWithBehavior(behaviorConfig?: string) {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ?? "postgres:///graphile_aggregates_test",
    });
    pool.on("error", () => {});
    pool.on("connect", (client) => {
      client.query(`set time zone 'UTC'`);
      client.on("error", () => {});
    });
  }

  const preset: GraphileConfig.Preset = {
    extends: [
      PostGraphileAmberPreset,
      PostGraphileConnectionFilterPreset,
      PgAggregatesPreset,
    ],
    disablePlugins: ["MutationPlugin", "PgIndexBehaviorsPlugin"],
    pgServices: [
      makePgService({
        pool,
        schemas: ["test"],
      }),
    ],
    schema: behaviorConfig
      ? {
          defaultBehavior: behaviorConfig,
        }
      : undefined,
  };
  return await makeSchema(preset);
}

describe("GroupedAggregates OrderBy Behavior", () => {
  it("should support opt-out via explicit negative behavior", async () => {
    const { schema } = await getSchemaWithBehavior(
      "-resource:groupedAggregates:orderBy -attribute:aggregate:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType | undefined;

    // When explicitly disabled, enum should have no values or not exist
    if (matchStatOrderByType) {
      const values = matchStatOrderByType.getValues();
      expect(values.length).toBe(0);
    }
  });

  it("should include orderBy enum values with resource-level opt-in", async () => {
    const { schema } = await getSchemaWithBehavior(
      "+resource:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType;

    expect(matchStatOrderByType).toBeDefined();
    const values = matchStatOrderByType.getValues();

    // Should have orderBy options for all aggregates on all suitable attributes
    expect(values.length).toBeGreaterThan(0);

    // Check for specific values we expect
    const valueNames = values.map((v) => v.name);
    expect(valueNames).toContain("SUM_POINTS_ASC");
    expect(valueNames).toContain("SUM_POINTS_DESC");
    expect(valueNames).toContain("AVERAGE_GOALS_ASC");
    expect(valueNames).toContain("MAX_SAVES_DESC");
  });

  it("should include orderBy enum values with attribute-level opt-in", async () => {
    const { schema } = await getSchemaWithBehavior(
      "+attribute:aggregate:groupedAggregates:orderBy"
    );
    const matchStatOrderByType = schema.getType(
      "MatchStatGroupedAggregatesOrderBy"
    ) as GraphQLEnumType | undefined;

    // When attribute-level behavior is enabled, enum should exist with values
    expect(matchStatOrderByType).toBeDefined();
    if (matchStatOrderByType) {
      const values = matchStatOrderByType.getValues();
      expect(values.length).toBeGreaterThan(0);

      const valueNames = values.map((v) => v.name);
      expect(valueNames).toContain("SUM_POINTS_ASC");
      expect(valueNames).toContain("AVERAGE_POINTS_DESC");
    }
  });

  // Note: This implementation supports two levels of control:
  // 1. Resource-level: +resource:groupedAggregates:orderBy (enables for all attributes)
  // 2. Attribute-level: +attribute:aggregate:groupedAggregates:orderBy (enables for specific attribute)
  //
  // Aggregate-specific behaviors (e.g., sum-only, average-only) are not currently supported
  // due to complexity in the behavior matching algorithm. If needed in the future, this could
  // be implemented by checking behaviors at the resource level rather than attribute level.
});
