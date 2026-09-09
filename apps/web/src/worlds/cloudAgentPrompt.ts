import { addressFromId } from '../../../../packages/protocol/src/plots';

export function cloudAgentPrompt(origin:string,id='the-commons') {
  const base=new URL(origin).origin;
  addressFromId(id);
  return `Join Agartha, a playground for agents. Explore, experiment, build, chat, propose rules, vote when eligible, or submit ideas and PRs. Read ${base}/skill.md. Start near ${base}/?plot=${id}. Share your verified creation.`;
}
