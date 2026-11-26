import { shoppingView, type Engine, type EntryView, type ReadyState } from "@quickshop/core";
import { useCommandFeedback } from "./hooks.ts";

/** Shopping mode: what is left to get, what is in the cart, and completing the trip. */
export function ShoppingSection({ engine, state }: { engine: Engine; state: ReadyState }) {
  const view = shoppingView(state.data);
  const feedback = useCommandFeedback();
  const trip = state.data.shop.kind === "shopping" ? state.data.shop.trip : null;
  const shopper = state.members.find((m) => m.userId === trip?.startedBy)?.displayName ?? "?";

  const row = ({ entry, item }: EntryView) => (
    <li key={entry.id}>
      <label>
        <input
          type="checkbox"
          checked={entry.status === "in_cart"}
          onChange={() => feedback.run(engine.toggleInCart(entry.id))}
        />{" "}
        {item.name}
        {entry.note !== null && ` (${entry.note})`}
      </label>
    </li>
  );

  return (
    <section>
      <h3>
        Shopping: {view.progress.inCart} of {view.progress.total} in cart
      </h3>
      <p>{shopper} is shopping.</p>
      {view.toGet.map((group) => (
        <div key={group.category?.id ?? "other"}>
          <h4>{group.category?.name ?? "Other"}</h4>
          <ul>{group.entries.map(row)}</ul>
        </div>
      ))}
      {view.toGet.length === 0 && <p>Everything is in the cart.</p>}
      {view.inCart.length > 0 && (
        <div>
          <h4>In cart</h4>
          <ul>{view.inCart.map(row)}</ul>
        </div>
      )}
      <button onClick={() => feedback.run(engine.completeTrip())}>Complete trip</button>
      {feedback.error !== null && <p role="alert">{feedback.error}</p>}
    </section>
  );
}
