Totally fine — you can drop **all per-track playback pointers** and just keep:

* `currentTime` (for UI)
* `lastTime` (only for “what func hits crossed since last scrub”)

…and re-derive everything on each `scrubToTime(t)` with binary searches.

Here’s the updated **view-mode + playback callbacks** architecture/plan (simple + virtualization-friendly).

---

## 1) Data + API (as you want)

### TrackDef (view mode + callbacks)

```ts
type TrackType = "number" | "enum" | "func";

type FuncElement = { funcName: string; args: any[] };

type TrackDatum =
  | { time: number; element: number }
  | { time: number; element: string }
  | { time: number; element: FuncElement };

type TrackDef = {
  name: string;
  fieldType: TrackType;
  data: TrackDatum[]; // initial data

  updateNumber?: (v: number) => void;
  updateEnum?: (v: string) => void;
  updateFunc?: (funcName: string, ...args: any[]) => void;

  low?: number;  // numbers only (default 0)
  high?: number; // numbers only (default 1)
};
```

### Exposed API

* `addTrack(trackDef): boolean`
* `scrubToTime(t: number): void`

  * updates *state tracks* (number/enum) for time `t`
  * fires *func hits* in `(lastTime, t]` (forward only)
  * sets `lastTime = t`
  * invalidates rendering
* `jumpToTime(t: number): void`

  * sets `currentTime = lastTime = t`
  * **no callbacks**
  * invalidates rendering

---

## 2) Core state (non-Vue) — dead simple

A single “core” object owned by the Vue parent:

```ts
type TrackRuntime = {
  id: string;            // internal stable id
  def: TrackDef;
  times: number[];       // sorted ascending (duplicates allowed)
  elems: any[];          // aligned with times (number|string|FuncElement)
  low: number;
  high: number;
};

type Core = {
  tracksByName: Map<string, TrackRuntime>;
  orderedTrackIds: string[];
  currentTime: number;
  lastTime: number;
};
```

### On `addTrack(def)`

1. Reject if name exists
2. Sort `def.data` stably by `time` (keep insertion order for equal-time ties)
3. Build `times[]` + `elems[]` once (no heavy state)
4. Store `low/high` defaults for number tracks
5. Invalidate render (new row will mount/draw)

> This is still “naive”: you’re only pre-sorting once so binary search is cheap and reliable.

---

## 3) Playback evaluation (binary search everywhere; no pointers)

You’ll want these helpers:

* `upperBound(times, t)` → first index `i` where `times[i] > t`
* `clamp(x, low, high)`

### 3.1 Numbers: evaluate value at time t

Algorithm per number track:

1. `r = upperBound(times, t)`
2. `i1 = r - 1`  (last point with `time <= t`, and if duplicates at `t` this picks the *last* one)
3. `i2 = r`      (first point with `time > t`)
4. Cases:

   * no points → return `low` (or 0)
   * `i1 < 0` → return `values[0]`
   * `i2 >= n` → return `values[i1]`
   * else linear interpolate between `(times[i1], v[i1])` and `(times[i2], v[i2])`
5. Clamp to `[low, high]`
6. Call `updateNumber(v)` **every scrub**

Duplicates naturally give you “vertical lines” visually, and for evaluation at exact duplicate times you deterministically pick the last one.

### 3.2 Enums: evaluate current enum at time t

Per enum track:

1. `i = upperBound(times, t) - 1`
2. If `i < 0` → if there’s any data, use `elems[0]`, else `""`
3. Else use `elems[i]`
4. Call `updateEnum(value)` **every scrub**

### 3.3 Func hits: fire events crossed since lastTime

Per func track, **only if `t > lastTime`**:

1. `start = upperBound(times, lastTime)` (strictly greater than lastTime)
2. `end = upperBound(times, t)`          (<= t)
3. For `i in [start, end)`:

   * `hit = elems[i] as FuncElement`
   * call `updateFunc(hit.funcName, ...hit.args)`

### 3.4 `scrubToTime(t)` ordering

Inside `scrubToTime(t)`:

1. Set `currentTime = t`
2. For every number+enum track → evaluate at `t` and call update
3. If `t > lastTime` → fire func hits in `(lastTime, t]`
4. Set `lastTime = t`
5. `renderScheduler.invalidate()`

If `t < lastTime`:

* simplest: treat it as “seek backwards”: update number/enum at `t`, **don’t fire func hits**, set `lastTime = t`, invalidate.

---

## 4) Rendering (view mode) — global dirty flag + row subscription

### RenderScheduler (single RAF, coalesced)

* `dirty = false`
* `rafPending = false`
* `subs = Set<() => void>`

Methods:

* `subscribe(fn) -> unsubscribe`
* `invalidate()`:

  * `dirty = true`
  * if not pending → schedule `requestAnimationFrame(frame)`
* `frame()`:

  * pending = false
  * if !dirty return
  * dirty = false
  * call all `subs`

No reasons. No complexity.

---

## 5) Vue component structure (virtualization-friendly)

### `AnimationEditorView.vue` (parent)

Owns:

* `core` (tracks + currentTime/lastTime)
* `renderScheduler`
* view window state: `windowStart`, `windowEnd`, `followCursor` (optional)
* search filter string
* ordered track list (with drag reorder)

Exposes API: `addTrack/scrubToTime/jumpToTime`

On:

* `scrubToTime/jumpToTime` → update core times + maybe auto-pan window + `invalidate()`
* window ribbon drag/resize → update windowStart/end + `invalidate()`

### Track list (normal or virtualized)

Render rows as separate components. With virtualization:

* mounted rows subscribe, unmounted rows unsubscribe automatically
* **newly mounted row draws once on mount** (important)

### `TrackRowView.vue`

* DOM name cell
* a `TrackCanvasView` canvas cell
* `onMounted`:

  * set up `ResizeObserver` for DPR sizing
  * `unsubscribe = scheduler.subscribe(draw)`
  * call `draw()` once immediately
* `onUnmounted`: cleanup + unsubscribe
* If your virtualizer *reuses* row instances: watch `trackId` and call `draw()` when it changes.

### `TrackCanvasView` draw logic

Inputs (read-only):

* track runtime (`times/elems/low/high/type`)
* view window (`windowStart/windowEnd`)
* row width/height from ResizeObserver
* `core.currentTime` for playhead mapping (optional)

For performance + simplicity:

* Consider rendering playhead as **one overlay div** spanning all rows (instead of drawing per-canvas). Then per-row draw is just the static mini-representation.

---

## 6) How children know to redraw (with virtualization)

They don’t need to “know” anything except:

* they’re mounted → subscribed
* scheduler invalidates → their draw callback runs

Virtualization works naturally because:

* only mounted rows exist to subscribe
* unmounted rows stop drawing automatically
* newly mounted rows call `draw()` once immediately (so they’re correct even if nothing invalidates right after mount)

---

## 7) What to hand off to the coding agent first

1. Implement `upperBound()` + core track normalization (sort + arrays)
2. Implement `Core.addTrack / jumpToTime / scrubToTime` with callbacks
3. Implement `RenderScheduler` (dirty flag + RAF)
4. Implement `TrackRowView` canvas sizing (ResizeObserver + DPR) + subscription + simple draw
5. Plug mock data + external driver calling `scrubToTime(t)` frame-by-frame

---

If you want, next step: I can write the **exact pseudocode / TS skeleton** for `upperBound`, `scrubToTime`, and the `RenderScheduler + TrackRowView` wiring (provide/inject), keeping it intentionally minimal and “hackable.”
