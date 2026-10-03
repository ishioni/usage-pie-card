# Usage Pie Card

A dependency-free Home Assistant doughnut card for power **or** volume usage. Forked from [stefanschaedeli/power-pie-card v0.3.1](https://github.com/stefanschaedeli/power-pie-card). It uses a distinct `usage-pie-card` element, editor and `usage-pie-card.js` resource so it can coexist with Power Pie Card. See [LICENSE](LICENSE).

## Installation

Add `ishioni/power-pie-card` as a HACS *Dashboard* custom repository and install **Usage Pie Card**, or copy `usage-pie-card.js` into `/config/www/` and register:

```yaml
url: /local/usage-pie-card.js
type: module
```

Do not use the upstream `power-pie-card.js` resource for this card. Reload the browser after changing resources.

## Daily water meters (L)

```yaml
type: custom:usage-pie-card
title: Today's usage by meter
display_unit: L
entities:
  - {entity: sensor.daily_kitchen_water, name: Kitchen}
  - {entity: sensor.daily_bathroom_water, name: Bathroom}
refresh_interval: 60
show_value: true
show_percentage: true
```

Each sensor's `unit_of_measurement` must be `m³` or `L` (mixing these is fine). For example, 0.125 m³ + 35 L displays as 0.16 m³ (with default two decimals); select `display_unit: L` to display 160 L. Values are *not* rates; use daily consumption entities, not flow-rate sensors.

## Options

| Option | Default | Meaning |
|---|---|---|
| `filter.include`, `filter.exclude` | none | Any matching include rule selects an entity; exclude rules remove it. Keys: `entity_id` (glob or `/regex/`), `domain`, `area`, `state` (comparison or literal). |
| `entities` | none | Static entity IDs or `{entity, name, color}` objects, merged with filtered entities. At least `entities` or `filter` is required. |
| `title` | none | Card heading. |
| `display_unit` | `W` | `W`, `kW`, `L` or `m³`; selects the unit family as well as the displayed unit. |
| `total_amount` | sum of compatible sensors | Total entity ID or numeric total (number or numeric string) in the **base unit** (`W` for power, `L` for volume). A larger total adds an untracked remainder. Numeric totals retain the original power card's W semantics even when displaying kW. |
| `unknown_text`, `other_text` | `Unknown`, `Other` | Labels for the untracked and folded slices. Legacy `unknownText` is accepted. |
| `decimals` | 0 (`W`, `L`), 2 (`kW`, `m³`) | Display precision (0–10). |
| `sort` | `max` | `max` or `none`. |
| `slice_gap` | 0.8 | Gap as percent of the circumference (0–5). |
| `legend` | `auto` | `auto`, `top`, `bottom`, `left`, `right`, `none`. |
| `max_slices` | 8 | Number of colored entity slices; extras fold into Other. |
| `show_value` | `true` | Show values in legend and chart tooltips. |
| `show_percentage` | `true` | Show percentages in legend and chart tooltips. |
| `refresh_interval` | `0` | Minimum seconds between paints; latest state wins. Zero paints immediately on each meaningful change. Initial paint and reconnect catch-up are immediate. |

The visual editor exposes these display and timing controls. The simple filter editor compares **raw source states** (e.g. `< 1` means less than 1 in *each sensor's own unit*); when mixing L and m³, avoid raw-state thresholds or use advanced filtering with care.

Incompatible or unknown units are **excluded**, not interpreted as the selected display unit (including on `total_amount`). A numeric zero with no unit is retained in the legend as 0; a positive reading with no unit is excluded. Unavailable, unknown, negative and non-numeric readings are excluded. The displayed total is the greater of measured sum and a valid configured total. A zero-only set shows a 0 total and no visible arcs.

Mouse hover pauses display updates until the pointer leaves; touch pauses for ten seconds after the last touch. Throttled updates coalesce to the latest Home Assistant state, and timers are cleared when the card disconnects.

## Development

Serve this directory and open `dev/index.html` to see power data at three sizes, or `dev/index.html?water` for the six-water-meter example (including zero without a unit and an incompatible W sensor). Run `node --test tests/usage-pie-card.test.cjs` for unit and scheduling tests.
