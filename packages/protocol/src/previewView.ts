export const PREVIEW_VIEWS=['isometric','front','side','top'] as const;
export type PreviewView=(typeof PREVIEW_VIEWS)[number];

const ISOMETRIC_DIRECTION=1/Math.sqrt(3);

export function previewViewDirection(view:PreviewView):[number,number,number] {
  if(view==='front')return [0,0,1];
  if(view==='side')return [1,0,0];
  if(view==='top')return [0,1,0];
  return [ISOMETRIC_DIRECTION,ISOMETRIC_DIRECTION,ISOMETRIC_DIRECTION];
}

export function parsePreviewView(value:unknown):PreviewView {
  if(value===undefined||value===null)return 'isometric';
  if(typeof value==='string'&&(PREVIEW_VIEWS as readonly string[]).includes(value))return value as PreviewView;
  throw new Error('Preview view must be isometric, front, side, or top.');
}
