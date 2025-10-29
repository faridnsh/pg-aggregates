import type {
  PgCodecAttribute,
  PgResource,
  PgSelectQueryBuilder,
} from "@dataplan/pg";
import type { GraphQLEnumValueConfigMap } from "graphql";

import type { AggregateSpec } from "./interfaces.js";
import { EXPORTABLE } from "./EXPORTABLE.js";

const { version } = require("../package.json");

declare global {
  namespace GraphileBuild {
    interface BehaviorStrings {
      "resource:groupedAggregates:orderBy": true;
      "attribute:aggregate:groupedAggregates:orderBy": true;
    }
    interface ScopeEnum {
      isPgAggregateGroupedOrderByEnum?: boolean;
    }
    interface ScopeEnumValues {
      isPgAggregateGroupedOrderByEnum?: boolean;
    }
  }
}

function isSuitableResource(resource: PgResource<any, any, any, any, any>) {
  return (
    !resource.parameters &&
    !!resource.codec.attributes &&
    !resource.isUnique
  );
}

const Plugin: GraphileConfig.Plugin = {
  name: "PgAggregatesAddGroupedAggregatesOrderByPlugin",
  description: "Adds the orderBy enum used by groupedAggregates.",
  version,
  provides: ["aggregates"],

  schema: {
    behaviorRegistry: {
      add: {
        "resource:groupedAggregates:orderBy": {
          description:
            "Should groupedAggregates orderBy options be added for this resource?",
          entities: ["pgResource"],
        },
        "attribute:aggregate:groupedAggregates:orderBy": {
          description:
            "Should groupedAggregates orderBy options be added for this attribute?",
          entities: ["pgCodecAttribute"],
        },
      },
    },

    entityBehavior: {
      pgResource: [
        "resource:groupedAggregates",
        "resource:groupedAggregates:orderBy",
      ],
      pgCodecAttribute: ["attribute:aggregate:groupedAggregates:orderBy"],
    },

    hooks: {
      init(_init, build) {
        const { inflection } = build;
        for (const resource of Object.values(
          build.input.pgRegistry.pgResources
        )) {
          if (!isSuitableResource(resource)) {
            continue;
          }
          if (
            !build.behavior.pgResourceMatches(
              resource,
              "resource:groupedAggregates"
            )
          ) {
            continue;
          }
          if (
            !build.behavior.pgResourceMatches(
              resource,
              "resource:groupedAggregates:orderBy"
            )
          ) {
            continue;
          }
          build.registerEnumType(
            inflection.aggregateGroupedAggregatesOrderByType({ resource }),
            {
              pgTypeResource: resource,
              isPgAggregateGroupedOrderByEnum: true,
            },
            () => ({
              description: build.wrapDescription(
                `Ordering options when grouping \`${inflection.tableType(
                  resource.codec
                )}\` aggregates.`,
                "type"
              ),
              values: {},
            }),
            `Adding groupedAggregates orderBy enum for ${resource.name}.`
          );
        }
        return _init;
      },

      GraphQLEnumType_values(values, build, context) {
        const {
          extend,
          inflection,
          sql,
          pgAggregateSpecs,
        } = build;
        const {
          scope: { isPgAggregateGroupedOrderByEnum, pgTypeResource: resource },
        } = context;
        if (
          !isPgAggregateGroupedOrderByEnum ||
          !resource ||
          resource.parameters ||
          !resource.codec.attributes
        ) {
          return values;
        }
        if (
          !build.behavior.pgResourceMatches(
            resource,
            "resource:groupedAggregates:orderBy"
          )
        ) {
          return values;
        }

        const tableTypeName = inflection.tableType(resource.codec);
        const additions: GraphQLEnumValueConfigMap = Object.create(null);

        const addAttributeOrderBy = (
          aggregateSpec: AggregateSpec,
          attributeName: string,
          attribute: PgCodecAttribute
        ) => {
          const attributeCodec = attribute.codec;
          const targetCodec =
            aggregateSpec.pgTypeCodecModifier?.(attributeCodec) ??
            attributeCodec;
          const attributeFieldName = inflection.attribute({
            attributeName,
            codec: resource.codec,
          });
          const baseName = inflection.constantCase(
            `${aggregateSpec.id}-${attributeFieldName}`
          );
          const makeApply = (direction: "ASC" | "DESC") =>
            EXPORTABLE(
              (
                aggregateSpec,
                attributeName,
                attributeCodec,
                sql,
                targetCodec,
                direction
              ) =>
                function apply($pgSelect: PgSelectQueryBuilder) {
                  const fragment = aggregateSpec.sqlAggregateWrap(
                    sql`${$pgSelect.alias}.${sql.identifier(attributeName)}`,
                    attributeCodec
                  );
                  $pgSelect.orderBy({
                    fragment,
                    codec: targetCodec,
                    direction,
                  });
                },
              [
                aggregateSpec,
                attributeName,
                attributeCodec,
                sql,
                targetCodec,
                direction,
              ]
            );

          additions[`${baseName}_ASC`] = {
            extensions: {
              grafast: {
                apply: makeApply("ASC"),
              },
            },
          };
          additions[`${baseName}_DESC`] = {
            extensions: {
              grafast: {
                apply: makeApply("DESC"),
              },
            },
          };
        };

        for (const aggregateSpec of pgAggregateSpecs) {
          if (
            !build.behavior.pgResourceMatches(
              resource,
              `${aggregateSpec.id}:resource:aggregates`
            )
          ) {
            continue;
          }

          for (const [attributeName, attribute] of Object.entries(
            resource.codec.attributes
          ) as [string, PgCodecAttribute][]) {
            if (
              !build.behavior.pgCodecAttributeMatches(
                [resource.codec, attributeName],
                `${aggregateSpec.id}:attribute:aggregate`
              )
            ) {
              continue;
            }
            if (
              !build.behavior.pgCodecAttributeMatches(
                [resource.codec, attributeName],
                "attribute:aggregate:groupedAggregates:orderBy"
              )
            ) {
              continue;
            }
            if (
              (aggregateSpec.shouldApplyToEntity &&
                !aggregateSpec.shouldApplyToEntity({
                  type: "attribute",
                  codec: resource.codec,
                  attributeName,
                })) ||
              !aggregateSpec.isSuitableType(attribute.codec)
            ) {
              continue;
            }

            addAttributeOrderBy(aggregateSpec, attributeName, attribute);
          }
        }

        if (Object.keys(additions).length === 0) {
          return values;
        }

        return extend(
          values,
          additions,
          `Adding groupedAggregates orderBy values for ${tableTypeName}`
        );
      },
    },
  },
};

export { Plugin as PgAggregatesAddGroupedAggregatesOrderByPlugin };
