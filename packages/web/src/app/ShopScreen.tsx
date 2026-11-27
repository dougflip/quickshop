import {
  shoppingView,
  type ActiveTrip,
  type Engine,
  type EntryView,
  type ReadyState,
} from "@quickshop/core";
import { useState } from "react";
import { useCommandFeedback } from "../hooks.ts";
import { clockTime, plural } from "./format.ts";
import { Icon } from "./icons.tsx";
import { Sheet } from "./Sheet.tsx";

/**
 * In the store: what's left to get, grouped by aisle, and what's in the cart. Works offline;
 * checks wait on the phone and sync when the connection is back.
 */
export function ShopScreen({
  engine,
  state,
  trip,
  onBack,
}: {
  engine: Engine;
  state: ReadyState;
  trip: ActiveTrip;
  onBack: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const feedback = useCommandFeedback();
  const view = shoppingView(state.data);
  const { inCart, total } = view.progress;
  const shopper =
    trip.startedBy === state.user.id
      ? "Shopping"
      : `${state.members.find((m) => m.userId === trip.startedBy)?.displayName ?? "Someone"} is shopping`;

  const row = (entryView: EntryView) => {
    const { entry, item } = entryView;
    const checked = entry.status === "in_cart";
    return (
      <li key={entry.id}>
        <button
          className="shoprow"
          aria-pressed={checked}
          onClick={() => feedback.run(engine.toggleInCart(entry.id))}
        >
          <span className="ck">{checked && <Icon name="check" weight={3} />}</span>
          <span className="main">
            <span className="nm">{item.name}</span>
            {entry.note !== null && <span className="sn">{entry.note}</span>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
      <header className="top">
        <div>
          <p className="sub">
            {shopper} · started {clockTime(trip.startedAt)}
          </p>
          <h1>
            {inCart} of {total} in cart
          </h1>
        </div>
        <button className="ghost" onClick={onBack}>
          List
        </button>
      </header>
      <div
        className="progress"
        role="progressbar"
        aria-label="In the cart"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={inCart}
      >
        <i style={{ width: `${String(total === 0 ? 0 : (inCart / total) * 100)}%` }} />
      </div>
      {feedback.error !== null && (
        <p className="hint error inset" role="alert">
          {feedback.error}
        </p>
      )}
      <div className="scroll">
        {view.toGet.length === 0 ? (
          <div className="empty">
            <b>Everything is in the cart</b>Complete the trip when you check out.
          </div>
        ) : (
          view.toGet.map((group) => (
            <section
              className="grp"
              key={group.category?.id ?? "other"}
              aria-label={group.category?.name ?? "Other"}
            >
              <h3>
                {group.category?.name ?? "Other"}
                <span>{group.entries.length}</span>
              </h3>
              <ul>{group.entries.map(row)}</ul>
            </section>
          ))
        )}
        {inCart > 0 && (
          <section className="grp cart" aria-label="In cart">
            <h3>
              In cart<span>{inCart}</span>
            </h3>
            <ul>{view.inCart.map(row)}</ul>
          </section>
        )}
      </div>
      <div className="dock">
        <button className="primary" onClick={() => setConfirming(true)}>
          Complete trip
        </button>
      </div>
      {confirming && (
        <Sheet label="Complete trip?" onClose={() => setConfirming(false)}>
          <h2>Complete trip?</h2>
          <p>
            {plural(inCart, "item")} in the cart will be cleared from the list.
            {total > inCart &&
              ` ${plural(total - inCart, "item")} not found will stay on the list for next time.`}
          </p>
          {feedback.error !== null && (
            <p className="error" role="alert">
              {feedback.error}
            </p>
          )}
          <div className="acts">
            <button
              className="primary"
              onClick={() => {
                if (feedback.run(engine.completeTrip())) setConfirming(false);
              }}
            >
              Complete trip
            </button>
            <button className="ghost" onClick={() => setConfirming(false)}>
              Keep shopping
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
