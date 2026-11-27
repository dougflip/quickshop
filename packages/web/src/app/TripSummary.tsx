import type { CompletedTrip, Engine } from "@quickshop/core";
import { plural } from "./format.ts";
import { Icon } from "./icons.tsx";

/** Shown on the shopper's phone right after completing a trip. */
export function TripSummary({ engine, trip }: { engine: Engine; trip: CompletedTrip }) {
  const bought = trip.items.filter((i) => i.outcome === "bought");
  const left = trip.items.filter((i) => i.outcome === "left");
  const minutes = Math.max(1, Math.round((trip.completedAt - trip.startedAt) / 60_000));
  return (
    <>
      <div className="hero">
        <span className="done-mark">
          <Icon name="check" weight={3} />
        </span>
        <h1>Trip done</h1>
        <p>
          {plural(bought.length, "item")} · {minutes} min
        </p>
      </div>
      <div className="scroll">
        <h2 className="sec">Bought</h2>
        {bought.length === 0 ? (
          <p className="hint">Nothing this time.</p>
        ) : (
          <ul aria-label="Bought">
            {bought.map((i) => (
              <li className="row" key={i.itemId}>
                <span className="nm">{i.name}</span>
              </li>
            ))}
          </ul>
        )}
        {left.length > 0 && (
          <>
            <h2 className="sec">Still on your list</h2>
            <p>These weren't found, so they stay for next time.</p>
            <ul aria-label="Still on your list">
              {left.map((i) => (
                <li className="row" key={i.itemId}>
                  <span className="nm">{i.name}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="dock">
        <button className="primary" onClick={engine.dismissTripSummary}>
          Back to list
        </button>
      </div>
    </>
  );
}
