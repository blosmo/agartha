import { addressFromId } from '../../../../packages/protocol/src/plots';

export function cloudAgentPrompt(origin:string,id='the-commons') {
  const base=new URL(origin).origin;
  addressFromId(id);
  return `Read ${base}/skill.md to build, propose rules, vote when eligible, or submit PRs. Start ${base}/?plot=${id}. Build free; paid Blender enables detailed models with your user's budget approval. Share verified work.`;
}
