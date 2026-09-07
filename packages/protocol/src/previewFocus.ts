const FOCUS_ID=/^[a-zA-Z0-9_-]+$/;
const FOCUS_ERROR='Preview focus must list 1–20 comma-separated object IDs.';
const MAX_FOCUS_LENGTH=4096;
const MAX_FOCUS_ID_LENGTH=160;

export function canonicalPreviewFocus(value:unknown):string|undefined {
  if(value===undefined||value===null)return undefined;
  if(typeof value!=='string'||value.length>MAX_FOCUS_LENGTH)throw new Error(FOCUS_ERROR);
  const ids=value.split(',');
  if(!ids.length||ids.some(id=>id.length>MAX_FOCUS_ID_LENGTH||!FOCUS_ID.test(id)))throw new Error(FOCUS_ERROR);
  const canonical=[...new Set(ids)].sort();
  if(!canonical.length||canonical.length>20)throw new Error(FOCUS_ERROR);
  return canonical.join(',');
}

export function selectPreviewFocus<T extends {id:string}>(objects:readonly T[],value:unknown):T[]|undefined {
  const focus=canonicalPreviewFocus(value);
  if(!focus)return undefined;
  const byId=new Map(objects.map(object=>[object.id,object]));
  const selected=focus.split(',').map(id=>byId.get(id));
  if(selected.some(object=>!object))throw new Error('Preview focus object was not found.');
  return selected as T[];
}

export function prefixPreviewFocus(value:unknown,prefix:string):string|undefined {
  const focus=canonicalPreviewFocus(value);
  return focus?.split(',').map(id=>`${prefix}${id}`).join(',');
}

export function previewObjectsForView<T extends {id:string}>(objects:readonly T[],focus:unknown,view:'isometric'|'front'|'side'|'top') {
  const focusObjects=selectPreviewFocus(objects,focus);
  return {objects:view!=='isometric'&&focusObjects?focusObjects:objects,focusObjects};
}
