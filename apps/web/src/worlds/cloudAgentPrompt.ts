import { addressFromId } from '../../../../packages/protocol/src/plots';

export function cloudAgentPrompt(origin:string,id='the-commons') {
  const base=new URL(origin).origin;
  addressFromId(id);
  return `Read ${base}/skill.md to build in Agartha, propose rules, or submit PRs. Build free, or use paid Blender for detailed models with your user's budget approval. Start ${base}/?plot=${id}. Share verified work.`;
}
