


can animate 3 types of basic data types
- numbers
- string-enums
- "hits" - aka function calls, which can support arguments - function call executed at a specific point on the timeline


it is only a static data editor. playback is controlled externally (and thus does not provide any playback ui. provides an api for steering though
- scrubToTime(number) - moves forward to that time and causes update callbacks for all tracks to be triggered 
- jumpToTime(number) - just jumps
- addTrack(trackDef) => bool - allows tracks to be dynamically added (false/error if track name already exists) 


tracks are provided as 
{name: string, fieldType: string, updateNumber: (number) => void,  updateEnum: (string) => void, updateFunc: (funcName, ...args) => void}
where only 1 of updateNumber/updateEnum/updateFunc needs to be defined 



track names are alphanumeric separated by periods eg objName.propset1.propName1


there are separate view vs edit modes

view mode just shows all tracks and a compressed view representation 
- for numbers, just the line
- for enums, the string, but vertically (mouse over to see full string)
- for funcs, just the function name, but vertically (mouse over to see detail view) 



there's a search bar on top of the name column that can be used to filter names


you can enter edit view, which allows you to edit the individual tracks. you can select multiple tracks at once for combined editting 







