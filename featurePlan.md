
https://www.figma.com/design/KLoYhk7KENWzQBQB9xGdz1/Animation-editor?node-id=0-1&p=f&t=jb90IyExCULkznZq-0

can animate 3 types of basic data types
- numbers
- string-enums - value 
- "hits" - aka function calls, which can support arguments - function call executed at a specific point on the timeline


it is only a static data editor. playback is controlled externally (and thus does not provide any playback ui). provides an api for steering though
- scrubToTime(number) - moves forward to that time and causes update callbacks for all tracks to be triggered 
- jumpToTime(number) - just jumps
- addTrack(trackDef) => bool - allows tracks to be dynamically added (false/error if track name already exists) 


tracks are provided as 
{name: string, fieldType: string, updateNumber: (number) => void,  updateEnum: (string) => void, updateFunc: (funcName, ...args) => void, high: number, low:  number}
where only 1 of updateNumber/updateEnum/updateFunc needs to be defined depending on the type, and high/low are optional and only used by numbers (range 0-1 by default)



track names are alphanumeric separated by periods eg objName.propset1.propName1


there are separate view vs edit modes

view mode just shows all tracks and a compressed view representation 
- for numbers, just the line
- for enums, the string, but vertically (mouse over to see full string) - hash string to show a stable random color bar
- for funcs, just the function name, but vertically (mouse over to see detail view) - hash function to show a stable random color bar

tracks are drag-reorderable





there's a search bar on top of the name column that can be used to filter tracks by name


you can enter edit view, which allows you to edit the individual tracks. you can select multiple tracks at once for combined editting 
- number editing is just a segmented line editor (no curves to start) 
	- click to add point at x position along existing curve, can drag points around (bounded on x by prev/next point) - can have "vertical" lines, but also store a pointIndex with every point so when doing playback, if you query for a time and get 2 points, you can disambiguate
- enum editting is just adding/deleting markers - a vertical with a visible "notch" on the exact time - drag left/right. click to add an enum with the first enum in the options list - use precion editor to change  
- enum editting is just adding/deleting markers - a vertical with a visible "notch" on the exact time - drag left/right, click to add function with default args - use precision editor to change 

for all of them, when you click them, they become selected - if a single one is selected, you'll get a small hovering "+" button that lets you open the precision editor, which lets you fill in exact time and specific values for each element


in edit view, number tracks will also show high/low bounds for the track - adjusting them in a way that leaves current points out of bounds will clamp values to the bounds

in edit view, all number tracks will display in the same area (lines drawn over each other)
all enum tracks will be in their own shared area 
all functiont tracks will be in their own shared area

track sidebars will still be visible - clicking on a track's sidebar will bring its elements to the "front" among all elements





both view mode and edit mode have their time range specified by the same time-range view component at the top - it has a ribbon that shows the selected time slice with individual handles that can be dragged to grow/shrink the viewing window, and dragging the whole ribbon moves the window. time ticks are shown for the local time window









longer run idea 
- add script editor for setting values programatically - be able to query tracks/values both generally and based on UI state + selections (e.g, for all visible tracks)
- turn script edits into macro buttons, or more generic macro controls/panels (have embeded UI api for plugins?)