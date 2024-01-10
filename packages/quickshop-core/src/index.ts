import * as R from "remeda";
import * as staticData from "./static-data";

import { Item, ItemsByDepartment } from "./types";

export { Item } from "./types";
export { items } from './static-data'

/**
 * Remove an item from `fromList` and append it to `toList`.
 * This does NOT preserve any kind of item order - always appends.
 */
export function moveItem(
  fromList: Item[],
  toList: Item[],
  item: Item
): [Item[], Item[]] {
  return [fromList.filter((x) => x.label !== item.label), [...toList, item]];
}

export function groupByDepartment(list: Item[]): ItemsByDepartment[] {
  const grouped = R.pipe(
    list,
    R.sortBy((x) => x.label),
    R.groupBy((x) => x.department)
  );

  return R.sortBy(Object.keys(grouped), (x) =>
    staticData.departments.findIndex((d) => d.label === x)
  ).map((x) => ({ departmentName: x, items: grouped[x] }));
}
