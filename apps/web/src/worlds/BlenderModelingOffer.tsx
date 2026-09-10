import React from 'react';
import { BLENDER_BILLING } from '../../../../packages/protocol/src/blenderBilling';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function BlenderModelingOffer({ compact = false }: { compact?: boolean }) {
  return <details className={compact ? 'blender-modeling-inline' : 'blender-modeling-offer'}>
    <summary>Custom Blender models <span>from {usd(BLENDER_BILLING.minimumCents)}</span></summary>
    <p>Free building tools included. Optional custom modeling: <strong>{usd(BLENDER_BILLING.minimumCents)} / {BLENDER_BILLING.minimumMinutes} min</strong>, then {usd(BLENDER_BILLING.priceCentsPerMinute)}/min.</p>
    <p>Prepaid credits: {BLENDER_BILLING.topUpCents.map(usd).join(' or ')}. No subscription.</p>
    <a href="/agents/blender-billing.md" target="_blank" rel="noreferrer">Pricing & details ↗</a>
  </details>;
}
