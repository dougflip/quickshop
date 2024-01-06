import * as R from 'remeda';

export type Id = unknown;

export type Department = {
  label: string;
};

export type Item = {
  label: string;
  department: string;
};

export type ItemsByDepartment = {
    departmentName: string;
    items: Item[];
}

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

export function groupByDepartment(list: Item[]): ItemsByDepartment[] {
    const grouped = R.groupBy(list, x => x.department);
    return Object.entries(grouped).map(([k, v]) => ({ departmentName: k, items: v }))
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
  { label: "Pasta" },
  { label: "Indian" },
  { label: "Dairy" },
  { label: "Meats" },
  { label: "Fish" },
  { label: "Frozen" },
];

export const items: Item[] = [
  // Produce (includes fruits)
  { label: "Apples", department: 'Produce' },
  { label: "Grapes", department: 'Produce' },
  { label: "Strawberries", department: 'Produce' },
  { label: "Blueberries", department: 'Produce' },
  { label: "Lettuce", department: 'Produce' },
  { label: "Mixed Greens", department: 'Produce' },
  { label: "Cucumbers", department: 'Produce' },
  { label: "Peppers", department: 'Produce' },
  { label: "Carrots", department: 'Produce' },
  { label: "Sweet Potatoes", department: 'Produce' },
  { label: "Brussel Sprouts", department: 'Produce' },
  { label: "Asparagus", department: 'Produce' },
  { label: "Cauliflower", department: 'Produce' },
  { label: "Green Beans", department: 'Produce' },

  // Bread
  { label: "Round Sourdough", department: 'Bread' },
  { label: "Hawaiin Rolls", department: 'Bread' },
  { label: "Wheat Bread", department: 'Bread' },
  { label: 'Brioche Hamburger Buns', department: 'Bread' },
  { label: 'Bagels Plain', department: 'Bread' },
  { label: 'Bagels Blueberry', department: 'Bread' },
  { label: 'English Muffins', department: 'Bread' },

  // Chips
  { label: "Plain Chips", department: 'Chips' },
  { label: "Tortilla Chips", department: 'Chips' },
  { label: "Ruffle Chips", department: 'Chips' },

  // Cheese/Dips
  { label: "Cheddar Block Sharp", department: 'Cheese/Dips' },
  { label: "Cheddar Block Mild", department: 'Cheese/Dips' },
  { label: "Havarti Block", department: 'Cheese/Dips' },
  { label: "Sliced Colby Jack", department: 'Cheese/Dips' },
  { label: "Sliced Havarti", department: 'Cheese/Dips' },
  { label: "Sliced Cheddar", department: 'Cheese/Dips' },
  { label: "Shredded Mozzarella", department: 'Cheese/Dips' },
  { label: "Blue Cheese", department: 'Cheese/Dips' },

  // Cereal
  { label: "Cheerios", department: 'Cereal' },

  // Pasta
  { label: "Shells", department: "Pasta" },
  { label: "Spaghetti", department: "Pasta" },
  { label: "Fettuccine", department: "Pasta" },
  { label: "4 Cheese Sauce", department: "Pasta" },

  // Tacos
  { label: "Soft Taco Shells Small", department: 'Tacos' },
  { label: "Soft Taco Shells Large", department: 'Tacos' },

  // Indian
  { label: "Tikka Masala Sauce", department: 'Indian' },

  // Dairy
  { label: "2% Milk", department: 'Dairy' },
  { label: "Greek Yogurt", department: 'Dairy' },
  { label: "Salted Butter", department: 'Dairy' },
  { label: "Unsalted Butter", department: 'Dairy' },
  { label: "Eggs", department: 'Dairy' },
  { label: "Cream Cheese", department: 'Dairy' },

  // Fish
  { label: "Tilapia", department: 'Fish' },
  { label: "Salmon", department: 'Fish' },

  // Meats
  { label: "Chicken", department: 'Meats' },
  { label: "Steak", department: 'Meats' },
  { label: "Bacon", department: 'Meats' },
  { label: "Sausage Cylinders", department: 'Meats' },
];
