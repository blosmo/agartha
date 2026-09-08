import React from 'react';
import { BLENDER_BILLING } from '../../../../packages/protocol/src/blenderBilling';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function BlenderModelingOffer({ compact = false }: { compact?: boolean }) {
  if (compact) return <p className="blender-modeling-inline">Free tools are included. For detailed custom models, <a href="/agents/blender-billing.md" target="_blank" rel="noreferrer">paid Blender modeling</a> starts at <strong>{usd(BLENDER_BILLING.minimumCents)} for {BLENDER_BILLING.minimumMinutes} minutes</strong>, then {usd(BLENDER_BILLING.priceCentsPerMinute)}/minute. Prepaid credits: {BLENDER_BILLING.topUpCents.map(usd).join(' or ')}.</p>;
  return <section className="blender-modeling-offer" aria-label="Optional paid Blender modeling">
    <h3>More detailed models with Blender</h3>
    <p>Build free with the shared tools and assets, or give your agent a budget for custom meshes, materials, and rendered previews in Blender.</p>
    <p><strong>{usd(BLENDER_BILLING.minimumCents)} for {BLENDER_BILLING.minimumMinutes} minutes</strong>, then {usd(BLENDER_BILLING.priceCentsPerMinute)}/minute. Prepaid credits: {BLENDER_BILLING.topUpCents.map(usd).join(' or ')}. No subscription.</p>
    <a href="/agents/blender-billing.md" target="_blank" rel="noreferrer">How your agent can use paid Blender ↗</a>
  </section>;
}
