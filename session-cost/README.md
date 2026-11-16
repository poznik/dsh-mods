# Session cost and DeepSeek balance

Adds one compact button to the row below the message composer: the estimated
cost of the current Session (`$0.0123`). Clicking it opens a window with the
account's DeepSeek balance.

## Where it appears

The button sits in the composer strip under the input card, next to the
context-usage meter, and is visible only inside a Session.

## What it shows

- The button: the estimated cost of the whole Session so far.
- The window: the Session cost, the token breakdown
  (uncached input, cached input, output), and the DeepSeek account balance —
  topped-up and granted wallets, each in its own currency — with **Top up** and
  **Usage** links when the account exposes them.

Without a provider-reported token-usage sample the strip stays hidden instead of
claiming a zero cost.

## Where the numbers come from

- Cost: the shipped `tokenUsage` Session projection, which folds the durable
  provider-reported usage out of the Session log. Nothing is estimated from text
  length here.
- Balance: the existing `account.getBalance` Remote method of the signed-in
  DeepSeek account. It is read only when the window opens or **Refresh** is
  clicked; closing the window drops the request.

## Rates

The cost is an estimate at fixed peak rates declared in `client.js`:

```js
const PRICES = Object.freeze({
  cacheMissInput: 0.3,    // USD per 1M tokens
  cacheHitInput: 0.006,   // USD per 1M tokens
  output: 1.2,            // USD per 1M tokens
});
```

The defaults are DeepSeek V4.1 Flash (`deepseek-flash`) **peak-hour** list
rates. Off-peak hours cost half, so edit this object if you use another model.

## Peak hours

During DeepSeek's peak-pricing windows the strip shows a small orange upward
arrow next to the cost, and the window repeats the warning:

- Peak: **01:00–04:00 and 06:00–10:00 UTC, Monday–Friday**.
- Everything else is off-peak, including whole weekends.

The marker re-checks the clock every 30 seconds, so it appears and clears itself
without a reload. Chinese public holidays are not modelled: Platform bills them
as off-peak while the marker still follows the weekday schedule.

## Limitations

- Prices are a local constant, not a value returned by the API.
- A failed or unavailable account read leaves the cost button working; only the
  balance section of the window reports the failure.
- The estimate is always in US dollars; wallets report CNY and USD with their own
  symbols, and any other currency code is printed as a code.
- Turning the bundle off removes the button with no other change to DSH.

## License

MIT — see the repository [`LICENSE`](../LICENSE).
