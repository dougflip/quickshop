import { useSyncExternalStore } from "react";
import { App } from "./App.tsx";
import type { Phone, World } from "./world.ts";

/** The phones, each running the real engine, plus the knobs to test them. */
export function Harness({ world }: { world: World }) {
  const phones = useSyncExternalStore(world.subscribe, world.getPhones);
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>
      <h1>QuickShop harness</h1>
      <p>
        Bare-bones screens over the real engine. {world.description}{" "}
        {world.reset !== null && <button onClick={world.reset}>Reset everything</button>}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        {phones.map((phone) => (
          <PhoneFrame key={phone.id} phone={phone} world={world} />
        ))}
      </div>
    </main>
  );
}

function PhoneFrame({ phone, world }: { phone: Phone; world: World }) {
  return (
    <section style={{ border: "1px solid #888", borderRadius: 12, padding: 12, width: 440 }}>
      <h2 style={{ marginTop: 0 }}>{phone.label}</h2>
      <p style={{ background: "#eee", padding: 8 }}>
        <label>
          <input
            type="checkbox"
            checked={phone.online}
            onChange={(e) => world.setOnline(phone.id, e.target.checked)}
          />{" "}
          Online
        </label>{" "}
        <label>
          <input
            type="checkbox"
            checked={phone.serverReachable}
            onChange={(e) => world.setServerReachable(phone.id, e.target.checked)}
          />{" "}
          Server reachable
        </label>{" "}
        <button onClick={() => world.relaunch(phone.id)}>Relaunch app</button>
      </p>
      <App key={phone.launch} engine={phone.engine} credentials={phone.credentials} />
    </section>
  );
}
