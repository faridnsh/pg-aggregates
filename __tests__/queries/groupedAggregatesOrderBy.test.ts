import { testGraphQL } from "../helpers.js";

it(
  "GroupedAggregatesOrderBy",
  testGraphQL(/* GraphQL */ `
    query GroupedAggregatesOrderBy {
      allMatchStats {
        top: groupedAggregates(
          groupBy: [PLAYER_ID]
          orderBy: [SUM_POINTS_DESC]
          first: 2
        ) {
          keys
          sum {
            points
          }
        }
        bottom: groupedAggregates(
          groupBy: [PLAYER_ID]
          orderBy: [SUM_POINTS_ASC]
          last: 2
        ) {
          keys
          sum {
            points
          }
        }
      }
    }
  `)
);
