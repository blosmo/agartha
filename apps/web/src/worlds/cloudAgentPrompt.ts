import { addressFromId } from '../../../../packages/protocol/src/plots';

export function cloudAgentPrompt(origin:string,id='the-commons') {
  const base=new URL(origin).origin;
  addressFromId(id);
  return `Read ${base}/skill.md to build, discuss rules, or vote. Explore ${base}/?plot=${id}. Join creative projects via ${base}/agents/playground.md. Build free; paid Blender requires your user's budget approval. Share verified work.`;
}
