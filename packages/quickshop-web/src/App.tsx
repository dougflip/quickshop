import {
  Item as ItemData,
  groupByDepartment,
  items,
  moveItem,
} from "@dougflip/quickshop-core";

import { Item } from "./components/item";
import classNames from "classnames";
import classes from "./App.module.css";
import { useLocalStorage } from "usehooks-ts";
import { useState } from "react";

type Mode = "select-items" | "shop-items";

function App() {
  const [mode, setMode] = useState<Mode>("select-items");
  const [allItems, setAllItems] = useLocalStorage<ItemData[]>("all-items", [
    ...items,
  ]);
  const [listItems, setListItems] = useLocalStorage<ItemData[]>(
    "shopping-list",
    []
  );
  const [fadedItems, setFadedItems] = useLocalStorage<string[]>(
    "faded-items",
    []
  );

  function fromAllToShop(x: ItemData) {
    const [newAll, newList] = moveItem(allItems, listItems, x);
    setAllItems(newAll);
    setListItems(newList);
  }

  function fromShopToAll(x: ItemData) {
    const [newList, newAll] = moveItem(listItems, allItems, x);
    setAllItems(newAll);
    setListItems(newList);
  }

  function resetState() {
    setAllItems([...items]);
    setListItems([]);
    setFadedItems([]);
  }

  return (
    <>
      <nav className={classes.nav}>
        <button
          className={classNames({
            [classes.selected]: mode === "select-items",
          })}
          onClick={() => setMode("select-items")}
        >
          Items
        </button>
        <button
          className={classNames({
            [classes.selected]: mode === "shop-items",
          })}
          onClick={() => setMode("shop-items")}
        >
          Shop
        </button>
      </nav>
      {mode === "select-items" && (
        <section>
          {groupByDepartment(allItems).map((x) => (
            <div key={x.departmentName} className={classes.department}>
              <h2 className={classes["department-header"]}>
                {x.departmentName}
              </h2>
              {x.items.map((item) => (
                <div>
                  <button
                    className={classes["item-button"]}
                    onClick={() => fromAllToShop(item)}
                  >
                    {item.label}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
      {mode === "shop-items" && (
        <section>
          {groupByDepartment(listItems).map((x) => (
            <div key={x.departmentName} className={classes.department}>
              <h2 className={classes["department-header"]}>
                {x.departmentName}
              </h2>
              {x.items.map((item) => (
                <Item
                  label={item.label}
                  leftText="⬅️"
                  onLeft={() => fromShopToAll(item)}
                  onRight={() =>
                    setFadedItems((items) => [...items, item.label])
                  }
                  itemState={
                    fadedItems.some((f) => f === item.label)
                      ? "faded"
                      : "normal"
                  }
                />
              ))}
            </div>
          ))}
        </section>
      )}
      <button onClick={resetState}>reset</button>
    </>
  );
}

export default App;
