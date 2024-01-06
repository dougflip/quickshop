export type Id = unknown;

export type Department = {
  label: string;
};

export type Item = {
  label: string;
  departmentId: Id;
};

export type Store = {
  label: string;
  departments: Department[];
};

export type ShoppingListItemGroup = {
  department: Department;
  items: Item;
};

/**
 * Items for a particular store that are organized by department.
 */
export type ShoppingList = {
  storeId: Id;
  items: ShoppingListItemGroup[];
};

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

// ====================
// These will probably go to some kind of database? eventually?
// For now, the web will stuff these in local storage
// ====================

const departments: Department[] = [
  { label: "Produce" },
  { label: "Bread" },
  { label: "Chips" },
  { label: "Cheese/Dips" },
  { label: "Cereal" },
  { label: "Tacos" },
  { label: "Dairy" },
  { label: "Meats" },
  { label: "Frozen" },
];

export const items: Item[] = [
  // Produce (includes fruits)
  { label: "Apples", departmentId: 1 },
  { label: "Grapes", departmentId: 1 },
  { label: "Strawberries", departmentId: 1 },
  { label: "Lettuce", departmentId: 1 },
  { label: "Mixed Greens", departmentId: 1 },
  { label: "Cucumbers", departmentId: 1 },
  { label: "Peppers", departmentId: 1 },
  { label: "Carrots", departmentId: 1 },
  { label: "Blueberries", departmentId: 1 },

  // Bread
  { label: "Round Sourdough", departmentId: 2 },
  { label: "Hawaiin Rolls", departmentId: 2 },
  { label: "Wheat Bread", departmentId: 2 },

  // Chips
  { label: "Plain Chips", departmentId: 3 },
  { label: "Tortilla Chips", departmentId: 3 },
  { label: "Ruffle Chips", departmentId: 3 },

  // Cheese/Dips
  { label: "Sharp Cheddar Block", departmentId: 4 },
  { label: "Shredded Mozzarella", departmentId: 4 },
  { label: "Blue Cheese", departmentId: 4 },

  // Cereal
  { label: "Cheerios", departmentId: 5 },

  // Tacos
  { label: "Soft Taco Shells Small", departmentId: 6 },
  { label: "Soft Taco Shells Large", departmentId: 6 },

  // Dairy
  { label: "2% Milk", departmentId: 7 },
  { label: "Greek Yogurt", departmentId: 7 },
  { label: "Salted Butter", departmentId: 7 },
  { label: "Unsalted Butter", departmentId: 7 },
  { label: "Eggs", departmentId: 7 },

  // Meats
  { label: "Chicken", departmentId: 8 },
  { label: "Bacon", departmentId: 8 },
  { label: "Sausage Cylinders", departmentId: 8 },
];
