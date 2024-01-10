import { Department, Item } from "./types";

export const departments: Department[] = [
  { label: "Produce" },
  { label: "Bread" },
  { label: "Chips" },
  { label: "Cheese/Dips" },
  { label: "Deli Meats" },
  { label: "Snacks" },
  { label: "Cereal" },
  { label: "Dressings/Jars" },
  { label: "Home Living" },
  { label: "Tacos" },
  { label: "Pasta" },
  { label: "Indian" },
  { label: "Meats" },
  { label: "Dairy" },
  { label: "Drinks" },
  { label: "Fish" },
  { label: "Frozen" },
];

export const items: Item[] = [
  // Produce (includes fruits)
  { label: "Apples", department: "Produce" },
  { label: "Grapes", department: "Produce" },
  { label: "Strawberries", department: "Produce" },
  { label: "Blueberries", department: "Produce" },
  { label: "Lettuce", department: "Produce" },
  { label: "Romaine Hearts", department: "Produce" },
  { label: "Mixed Greens", department: "Produce" },
  { label: "Cucumbers", department: "Produce" },
  { label: "Peppers", department: "Produce" },
  { label: "Carrots", department: "Produce" },
  { label: "Sweet Potatoes", department: "Produce" },
  { label: "Brussel Sprouts", department: "Produce" },
  { label: "Asparagus", department: "Produce" },
  { label: "Cauliflower", department: "Produce" },
  { label: "Green Beans", department: "Produce" },

  // Bread
  { label: "Round Sourdough", department: "Bread" },
  { label: "Hawaiin Rolls", department: "Bread" },
  { label: "Wheat Bread", department: "Bread" },
  { label: "Brioche Hamburger Buns", department: "Bread" },
  { label: "Bagels Plain", department: "Bread" },
  { label: "Bagels Blueberry", department: "Bread" },
  { label: "English Muffins", department: "Bread" },

  // Chips
  { label: "Plain Chips", department: "Chips" },
  { label: "Tortilla Chips", department: "Chips" },
  { label: "Ruffle Chips", department: "Chips" },
  { label: "Pretzel Minis", department: "Chips" },
  { label: "Pretzel Stix", department: "Chips" },
  { label: "Pretzel Chips", department: "Chips" },
  { label: "Apple Sauce", department: "Chips" },

  // Cheese/Dips
  { label: "Cheddar Block Sharp", department: "Cheese/Dips" },
  { label: "Cheddar Block Mild", department: "Cheese/Dips" },
  { label: "Havarti Block", department: "Cheese/Dips" },
  { label: "Sliced Colby Jack", department: "Cheese/Dips" },
  { label: "Sliced Havarti", department: "Cheese/Dips" },
  { label: "Sliced Cheddar", department: "Cheese/Dips" },
  { label: "Shredded Mozzarella", department: "Cheese/Dips" },
  { label: "Taco/Italian Shredded", department: "Cheese/Dips" },
  { label: "Blue Cheese", department: "Cheese/Dips" },
  { label: "String Cheese", department: "Cheese/Dips" },

  // Deli Meats
  { label: "Ham", department: "Deli Meats" },
  { label: "Turkey", department: "Deli Meats" },
  { label: "Salami", department: "Deli Meats" },
  { label: "Prosciutto", department: "Deli Meats" },

  // Snacks
  { label: "Club Crackers", department: "Snacks" },
  { label: "Jimmy Crackers", department: "Snacks" },

  // Cereal
  { label: "Cheerios", department: "Cereal" },

  // Dressings/Jars
  { label: "Pickles", department: "Dressings/Jars" },
  { label: "Zesty Italian Dressing", department: "Dressings/Jars" },
  { label: "Olive Garden Dressing", department: "Dressings/Jars" },
  { label: "Raisins Snack Boxes", department: "Dressings/Jars" },
  { label: "Raisins Big Box", department: "Dressings/Jars" },

  // Home Living
  { label: "Paper Towels", department: "Home Living" },
  { label: "Toilet Paper", department: "Home Living" },

  // Pasta
  { label: "Shells", department: "Pasta" },
  { label: "Spaghetti", department: "Pasta" },
  { label: "Fettuccine", department: "Pasta" },
  { label: "4 Cheese Sauce", department: "Pasta" },

  // Tacos
  { label: "Soft Taco Shells Small", department: "Tacos" },
  { label: "Soft Taco Shells Large", department: "Tacos" },

  // Indian
  { label: "Tikka Masala Sauce", department: "Indian" },
  { label: "Jasmine Rice", department: "Indian" },
  { label: "Basmatti Rice", department: "Indian" },
  { label: "White Rice", department: "Indian" },

  // Dairy
  { label: "2% Milk", department: "Dairy" },
  { label: "Greek Yogurt", department: "Dairy" },
  { label: "Salted Butter", department: "Dairy" },
  { label: "Unsalted Butter", department: "Dairy" },
  { label: "Eggs", department: "Dairy" },
  { label: "Cream Cheese", department: "Dairy" },
  { label: "Strawberry Cream Cheese", department: "Dairy" },
  { label: "Whipped Cream Cheese", department: "Dairy" },
  { label: "Orange Juice", department: "Dairy" },

  // Drinks
  { label: "Le Croix", department: "Drinks" },

  // Fish
  { label: "Tilapia", department: "Fish" },
  { label: "Salmon", department: "Fish" },

  // Meats
  { label: "Chicken", department: "Meats" },
  { label: "Steak", department: "Meats" },
  { label: "Bacon", department: "Meats" },
  { label: "Sausage Cylinders", department: "Meats" },

  // Frozen
  { label: "Chicken Fingers", department: "Frozen" },
  { label: "Waffles", department: "Frozen" },
  { label: "French Toast", department: "Frozen" },
  { label: "Cheese Pizza", department: "Frozen" },
  { label: "Peas", department: "Frozen" },
  { label: "Peas and Corn", department: "Frozen" },
];
