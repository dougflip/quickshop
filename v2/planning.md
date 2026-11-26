## MVP

I picture this as a PWA so it can be "installed" on my phone.
This will have some sort of authentication so that both my wife and I can authenticate and share the list. It is important that we can both manage the same list.

I'd like for this to function in realtime or close to it.
Essentially, when I add an item my wife sees it reasonably quickly and vice versa.

Offline support is not entirely essential, but it is likely pretty important.
I can imagine while actually shopping network could be bad.
In that case, you should be able to mark items and when network returns have them sync'd.
I do NOT expect that we need strong conflict management in MVP.
Likely only one person is shopping at a time and marking items.

### Features

1. Basic authentication (2 users initially but should not necessarily limit ourselves)
2. CRUD a shopping list prior to shopping
3. When shopping, mark items that are "done" (added to your cart)
4. Complete a shopping trip
5. Start back to CRUD of shopping list (for your next trip to the store)

### Tech Potentials

1. Supabase - I've used the free tier in the past. Anything that breats this?
2. Auth - can be user/pass or Google or something else. Looking to start simple
3. Most familiar with React but open to a different framework or none at all if it is overkill
4. TypeScript for sure, regardless. Following best practices: strict, discriminated unions, exhaustive switch statements, etc.
5. Core logic in plain TS files (regardless of framework) to keep logic out of views.
   I typically think - at least theoretically - that the "core" of the app could run headlessly without a UI as all of the logic is in plain TS.

### User Stories (high level)

1. User can log in
2. User can manage items in the system. For example, the system knows "bread" or "milk" as items in the system. Items should be able to be categorized i.e. "dairy", "fruit", "vegetable". We may want to support multiple categories per item.
3. User can add items to a shopping list. So "milk" _always_ exists in the system, but I add it to my list to indicate I need to buy it during the next shopping trip
4. User can "shop". At this point, they are marking items as "done" from the shopping list
5. User can mark shopping completed. This should clear all of the "Done" items from the list
6. User can restart the process of adding items to a list

## Decisions (from mockup review)

Mockup: [mockups/index.html](./mockups/index.html). Data model: [data-model.md](./data-model.md).

- Supabase to start, isolated behind interfaces in a plain-TS core so the provider can be swapped.
- Supabase email + password. No sign-up; accounts are seeded by hand.
- Households: a user can belong to several, but the app opens the first one for now.
- Screens for MVP: sign in, List, Catalog, Shopping, Trip summary. No history or household settings yet.
- Items can have several categories. The list groups an item under its first one. Category order is fixed for now, set by hand to match the store we use most.
- One free-text note per list entry, no quantity field.
- Offline: starting a trip, checking items off and completing a trip all work offline and sync later, with the latest change winning. Adding and editing need a connection.
- Items not found stay on the list after a trip completes.
- One shopper at a time. The other person sees who is shopping and can still add items.
- Trips are recorded even though there's no history screen yet.
- React for the UI, kept thin. PWA hosted on GitHub Pages.

## Future ideas

- Category order per store, since stores are laid out differently. For now there is one fixed order matching the store we use most, defined by hand.
- Item location per store ("this item is in aisle 7 at this store"), and items only sold at certain stores. Categories stand in for now.
