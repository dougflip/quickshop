import { Item as ItemData, items, moveItem } from "@dougflip/quickshop-core";

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
          {ignoredItems.map((x) => (
            <Item label={x.label} />
          ))}
        </section>
      )}
      {mode === "select-items" && (
        <section className={classes.items}>
          {allItems.map((x) => (
            <Item
              label={x.label}
              onAdd={() => fromAllToShop(x)}
              onDismiss={() => fromAllToIgnore(x)}
            />
          ))}
        </section>
      )}
      {mode === "review-items" &&
        listItems.map((x) => <Item label={x.label} />)}
    </>
  );
}

export default App;
