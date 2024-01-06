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

type Mode = "ignored-items" | "select-items" | "review-items";

function App() {
  const [mode, setMode] = useState<Mode>("select-items");
  const [ignoredItems, setIgnoredItems] = useLocalStorage<ItemData[]>(
    "ignored-items",
    []
  );
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

  function fromAllToIgnore(x: ItemData) {
    const [newAll, newIgnore] = moveItem(allItems, ignoredItems, x);
    setAllItems(newAll);
    setIgnoredItems(newIgnore);
  }

  function resetState() {
    setIgnoredItems([]);
    setAllItems([...items])
    setListItems([]);
    setFadedItems([]);
  }

  return (
    <>
      <nav className={classes.nav}>
        <button
          className={classNames({
            [classes.selected]: mode === "ignored-items",
          })}
          onClick={() => setMode("ignored-items")}
        >
          Ignored
        </button>
        <button
          className={classNames({
            [classes.selected]: mode === "select-items",
          })}
          onClick={() => setMode("select-items")}
        >
          Select Items
        </button>
        <button
          className={classNames({
            [classes.selected]: mode === "review-items",
          })}
          onClick={() => setMode("review-items")}
        >
          Shop
        </button>
      </nav>
      {mode === "ignored-items" && (
        <section>
          {groupByDepartment(ignoredItems).map((x) => (
            <div key={x.departmentName} className={classes.department}>
              <h2 className={classes["department-header"]}>
                {x.departmentName}
              </h2>
              {x.items.map((item) => (
                <Item label={item.label} />
              ))}
            </div>
          ))}
        </section>
      )}
      {mode === "select-items" && (
        <section>
          {groupByDepartment(allItems).map((x) => (
            <div key={x.departmentName} className={classes.department}>
              <h2 className={classes["department-header"]}>
                {x.departmentName}
              </h2>
              {x.items.map((item) => (
                <Item
                  label={item.label}
                  onAdd={() => fromAllToShop(item)}
                  onDismiss={() => fromAllToIgnore(item)}
                />
              ))}
            </div>
          ))}
        </section>
      )}
      {mode === "review-items" && (
        <section>
          {groupByDepartment(listItems).map((x) => (
            <div key={x.departmentName} className={classes.department}>
              <h2 className={classes["department-header"]}>
                {x.departmentName}
              </h2>
              {x.items.map((item) => (
                <Item
                  label={item.label}
                  onAdd={() => setFadedItems(items => [...items, item.label])}
                  itemState={fadedItems.some(f => f === item.label) ? 'faded' : 'normal'}
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
