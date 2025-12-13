Got it. Here’s an **edit mode plan** updated for:

* **Konva** (for dragging + event handling)
* **emit-only** child → parent actions (directional flow)
* **no per-frame re-render needed** in edit mode (only rebuild on commits / window changes)
* **precision edits are NOT clamped to the view window** (but still validated; numbers still clamp vs neighbors)

I’ll keep it at the same “hand-off to coding agent” level of specificity.

---

# 1) Edit mode shape: parent owns state + reducer, lanes are Konva views

## 1.1 Parent (`AnimationEditorView.vue`) owns everything mutable

You already do this for view mode; extend it:

**World state**

* `tracksById` (or by name)
* `trackOrder`
* each track has `{ id, name, fieldType, low/high?, data: [{id,time,element}, ...] }`

**Edit state**

* `mode: "view" | "edit"`
* `editEnabledTrackIds: Set<trackId>`
* `frontTrackIdByType: { number?: trackId; enum?: trackId; func?: trackId }`
* `selectedElementByType: { number?: elementId; enum?: elementId; func?: elementId }`
* `precision: { open, type, trackId, elementId, saved, draft, dirty }`
* `toasts: []` (or whatever you already use)

**History**

* `undoStack: WorldSnapshot[]`
* `redoStack: WorldSnapshot[]`

**Edit render trigger**

* `editRenderVersion = ref(0)` (increment when you want Konva lanes to rebuild from canonical state)

## 1.2 Lanes are “pure views” with a tiny local drag preview

Each Konva lane component:

* receives the canonical state as props (filtered+enabled tracks of its type, the front track id, windowStart/end, selection id, renderVersion)
* **does not mutate parent state**
* emits actions like `{type:"NUMBER/DRAG_PREVIEW", ...}`

During drag, the lane updates Konva nodes locally for smoothness, but the **canonical data only changes on drag end**.

---

# 2) Action/event contract (emit-only)

Use one event channel per lane for simplicity:

```vue
<NumberLaneKonva @action="onLaneAction" ... />
```

Action shapes (minimal set):

### Global / sidebar

* `TRACK/TOGGLE_EDIT_ENABLED { trackId, enabled }`
* `TRACK/SET_FRONT { fieldType, trackId }`
* `TRACK/DELETE { trackId }`
* `EDIT/UNDO {}`
* `EDIT/REDO {}`

### Selection / precision

* `ELEMENT/SELECT { fieldType, trackId, elementId }`
* `PRECISION/OPEN { fieldType, trackId, elementId }`
* `PRECISION/CHANGE_DRAFT { ...partialDraft }`
* `PRECISION/SAVE {}`
* `PRECISION/REVERT {}`
* `PRECISION/CLOSE {}`

### Number lane

* `NUMBER/ADD { trackId, time, value }`
* `NUMBER/DELETE { trackId, elementId }`
* `NUMBER/DRAG_START { trackId, elementId }`
* `NUMBER/DRAG_PREVIEW { trackId, elementId, time, value }`   // live callbacks happen in parent
* `NUMBER/DRAG_END { trackId, elementId, time, value }`       // commit + snapshot

### Enum lane

* `ENUM/ADD { trackId, time }`
* `ENUM/DELETE { trackId, elementId }`
* `ENUM/DRAG_PREVIEW { trackId, elementId, time }`
* `ENUM/DRAG_END { trackId, elementId, time }`

### Func lane

* `FUNC/ADD { trackId, time }`
* `FUNC/DELETE { trackId, elementId }`
* `FUNC/DRAG_PREVIEW { trackId, elementId, time }`
* `FUNC/DRAG_END { trackId, elementId, time }`

---

# 3) Parent reducer rules (the “single source of truth”)

## 3.1 Commit vs preview

* **Preview actions** do **not** modify canonical track data and do **not** push history.
* **End actions** (drag end, add, delete, precision save, bounds change, delete track) *do* modify canonical data and *do* push history.

## 3.2 Live callbacks while dragging

On `*_DRAG_PREVIEW` for **number/enum**:

* Update only the *external callbacks* live.
* Recommended default (correct + simple):

  * Evaluate state at the **current playhead time** using a temporary “effective data” that applies this one preview override.
  * Call `updateNumber/updateEnum` for all state tracks (or at least the affected track; your choice).
* Do **not** fire `updateFunc` during editing drags (side-effecty); only via `scrubToTime()`.

Implementation trick (naive, fine for small data):

* In the callback-evaluation function, if a preview override exists for a given track+element, temporarily replace that element in a copied array (or do a linear scan merge) and evaluate.

## 3.3 History snapshots (naive world snapshots)

* Push snapshot on:

  * drag end (any lane)
  * add/delete element
  * delete track
  * precision save
  * bounds change (low/high) + resulting clamping
* Clear redo stack on any new commit.

---

# 4) Konva lane implementation (3 lanes, one stage each)

Edit mode doesn’t need a per-frame render loop. Use:

* `watch(renderVersion, rebuildScene)`
* `watch(windowStart/end, rebuildScene)`
* `watch(frontTrackId, rebuildScene)`
* `watch(enabledTracks list, rebuildScene)`
* `watch(selectedElementId, updateHighlight)` (no rebuild required)

## 4.1 Shared lane setup (Numbers/Enums/Funcs)

Each lane component:

* creates `Konva.Stage` in `onMounted`
* has 1–2 layers:

  * `gridLayer` (optional)
  * `contentLayer` (tracks + elements)
* `ResizeObserver` updates stage width/height

Provide helper functions:

* `timeToX(t)` and `xToTime(x)`
* clamp drag X to `[0, width]` (your “clamp to view window when dragging” rule)

### Rendering strategy (simple)

On rebuild:

* `contentLayer.destroyChildren()`
* draw non-front tracks first (reference)
* draw front track last (interactive)
* keep a `Map<elementId, Konva.Node>` for front track elements for selection highlight & positioning the “+” button.

---

# 5) Number lane details (Konva shapes + constraints)

## 5.1 Shapes

For each number track:

* a `Konva.Line` polyline through its keyframes (straight segments)
* for the **front** track only:

  * one `Konva.Circle` per point (`draggable: true`)
  * optional: faint horizontal lines at `low` and `high`

## 5.2 Adding a point

On stage click (background only):

* Only if there is a front number track
* If click hits nothing interactive (Konva gives you `e.target === stage` or `layer`)
* Compute:

  * `t = clamp(xToTime(pointerX), windowStart, windowEnd)`  *(drag clamping rule; for add you can keep it too)*
  * `v = yToValue(pointerY, low/high)` then clamp to bounds
* Emit `NUMBER/ADD`

Parent handles:

* insert new item (stable id)
* keep data sorted by time (stable insert)
* push snapshot
* set selection to new id
* `editRenderVersion++`

## 5.3 Dragging a point

On circle drag events:

* `dragstart`: emit select + `NUMBER/DRAG_START`

* `dragmove`:

  * derive proposed `(t,v)` from circle position
  * clamp:

    * to window: `[windowStart, windowEnd]`
    * to neighbors in canonical list **by index ordering** (inclusive, allow equality)

      * find the element’s index in the array once on dragstart and cache it locally
      * `prevTime <= t <= nextTime`
    * `v` clamped live to `[low, high]`
  * snap circle back to the clamped `(x,y)`
  * update the **front line’s** points array in-place (use canonical points + override this one index)
  * emit `NUMBER/DRAG_PREVIEW {t,v}`

* `dragend`:

  * emit `NUMBER/DRAG_END {t,v}`

Parent on `DRAG_END`:

* apply the time/value to that element
* (optional) re-stable-sort by time; with neighbor clamping it should already be ordered
* push snapshot
* `editRenderVersion++`

### Shift-click delete

Circle `click` handler:

* if `evt.shiftKey`: emit `NUMBER/DELETE`

---

# 6) Enum lane details (no duplicates + push-out on commit)

## 6.1 Options source

For each enum track:

* options = `track.enumOptions ?? unique(values in track.data)`, fallback `[""]`

## 6.2 Shapes

For each enum marker:

* a `Konva.Group` (draggable true) containing:

  * a vertical `Konva.Line` + small notch
  * a small colored rect/bar (color hashed from the string value)

Non-front tracks:

* same, but not draggable and lighter.

Front track:

* draggable markers; click selects; shift-click deletes.

## 6.3 Add marker

On background click:

* time = click position (clamped to window for add is OK)
* value = options[0]
* emit `ENUM/ADD {time}`

Parent:

* insert marker (id)
* **no duplicate time rule**: if conflicts, resolve immediately or allow and resolve on commit; simplest: resolve immediately and toast
* snapshot + renderVersion++

## 6.4 Drag marker

Group drag:

* restrict motion to x only (set y back in dragmove)
* dragmove: clamp to window; emit `ENUM/DRAG_PREVIEW {time}`
* dragend: emit `ENUM/DRAG_END {time}`

Parent on `DRAG_END`:

* apply time
* enforce no-duplicate-times with push-out:

  * EPS = 0.1
  * if within EPS of another marker time, push this one away and toast `"cant have elements at same time"`
* stable-sort by time
* snapshot + renderVersion++

**Precision edits**:

* time > 0, NOT clamped to window
* still enforce no-duplicate time via push-out + toast
* snapshot + renderVersion++

---

# 7) Func lane details (same as enum, plus args editing in precision)

Shapes identical to enum, but:

* color hashed from `funcName`
* marker stores `{funcName, args[]}`

Add:

* time = click position
* element default: `{ funcName: "", args: [] }` (or `"func"` if you prefer)
* emit `FUNC/ADD`

Drag:

* same as enum (no duplicates; push-out on end)

Precision editor for args:

* up to 5 rows: `[typeDropdown(text|number), textInput]`
* on save parse:

  * text => string
  * number => Number(raw), must be finite
* time > 0, not clamped to window
* snapshot + renderVersion++

And again: don’t call `updateFunc` during edit interactions; only via `scrubToTime()`.

---

# 8) Precision editor + “+” floating button

## 8.1 When to show the “+” button

* Only when there is a selected element for that lane
* Position it near the selected Konva node:

  * lane component can expose `getAnchorForElement(elementId)` via emit? (but you prefer emit-only)
  * simplest: parent stores selection, lane computes anchor locally and renders a DOM button overlay itself.

So each lane can include:

* a positioned `<button>` overlay inside the lane container
* it follows the selected node’s `getAbsolutePosition()` (converted to container coords)
* on click: emit `PRECISION/OPEN`

## 8.2 Precision editor state (parent-owned)

* open/close
* saved vs draft
* dirty flag
* Save creates a commit (snapshot + renderVersion++)
* Revert resets draft to saved

Validation:

* time must be > 0
* number finite
* enum value from dropdown
* number time clamp-to-neighbors (toast `"time clamped"`)
* enum/func collision push-out (toast `"cant have elements at same time"`)

---

# 9) Playback integration while editing (no autoscroll)

* `scrubToTime(t)` continues to:

  * update state tracks (numbers/enums) + fire hits (funcs)
  * update `currentTime` and invalidate any *playhead overlay*

**Edit mode rendering does not need to rebuild lanes on scrub.**

* Lanes only rebuild on `editRenderVersion` changes or window changes.
* Use a single DOM playhead line overlay (recommended) so scrubbing doesn’t touch Konva scene.

During an active drag:

* you’ll also be emitting `*_DRAG_PREVIEW` which triggers live state callbacks.
* If scrub calls are coming in simultaneously, simplest rule:

  * scrub updates happen as usual (canonical data)
  * drag preview updates also happen as they occur
  * last call wins (acceptable for hacking)

(If that feels noisy later, you can gate preview updates while playing.)

---

# 10) Build order (so you can test incrementally)

1. **Konva lane scaffolding** (3 stages, resize, rebuild from props)
2. Sidebar editEnabled + front track selection + delete track (parent commits + renderVersion)
3. Number lane:

   * draw lines + points
   * add point
   * drag point with neighbor+window+bounds clamps
   * shift-click delete
   * commit snapshots on dragend
4. Enum lane:

   * add + drag + delete + push-out collision on dragend
5. Func lane:

   * same as enum + precision editor args
6. Precision editor saved/draft/revert + “+” overlay button
7. Undo/redo snapshot traversal

---

If you want the next step, I can write a concrete “reducer-style” pseudo-implementation for `onLaneAction(action)` (exact mutations + when to bump `editRenderVersion` + when to push snapshot), plus the Konva lane “rebuildScene” skeleton for numbers/enums/funcs.
