import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Check, Copy, Crown, Link2, Minus, Plug, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorMessage, teamRequest } from './team-client';
import type { TeamAccount } from './team-contract';
import './plans.css';

export const PRO_PRICE = '£99';

const ROWS: Array<[string, boolean | string, boolean | string]> = [
  ['Writing, story, production and Creator studio on your device', true, true],
  ['Imports and exports (FDX, Fountain, Celtx, Fade In, PDF, Word…)', true, true],
  ['Cloud team projects with live co-writing', '1 project', 'Unlimited'],
  ['AI partner on the workspace model', '10 a day', '150 a day'],
  ['AI partner with your own key or OpenRouter', true, true],
  ['Claude and ChatGPT connector', false, true],
  ['Future features', 'Most', 'All, for life']
];

function cell(value: boolean | string) {
  if (value === true) return <Check size={16} aria-label="Included" className="plans-yes" />;
  if (value === false) return <Minus size={16} aria-label="Not included" className="plans-no" />;
  return value;
}

/** Starts Stripe Checkout for the lifetime upgrade, or sends a signed-out visitor to sign in first. */
export async function upgrade(onError: (message: string) => void) {
  try {
    const { url } = await teamRequest<{ url: string }>('checkout');
    window.location.assign(url);
  } catch (error) {
    if ((error as { status?: number }).status === 401) window.location.hash = '#team';
    else onError(errorMessage(error));
  }
}

export function PlansDialog({ account, onClose }: { account?: TeamAccount; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pro = account?.plan === 'pro' && account.billing;
  return <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} width={680}>
    <Layout header={<DialogHeader title="SWDR plans" subtitle="Free forever on your device. Pro is one payment, for life — no subscription." onOpenChange={open => { if (!open) onClose(); }} />}
      content={<LayoutContent>
        <div className="plans">
          <table className="plans-table">
            <thead><tr><th scope="col"><span className="sr-only">Feature</span></th><th scope="col">Free<small>£0</small></th>
              <th scope="col" className="plans-pro">Pro<small>{PRO_PRICE} once</small></th></tr></thead>
            <tbody>{ROWS.map(([label, free, paid]) => <tr key={label}><th scope="row">{label}</th><td>{cell(free)}</td><td className="plans-pro">{cell(paid)}</td></tr>)}</tbody>
          </table>
          {pro ? <p className="plans-owned"><Crown size={16} aria-hidden="true" /> You have SWDR Pro for life. Thank you.</p>
            : account?.billing === false ? <p className="plans-note">Upgrades are not open on this workspace yet, so every account has Pro limits for now.</p>
            : <div className="plans-cta">
              <Button label={account ? `Get Pro for life — ${PRO_PRICE}` : 'Sign in to get Pro'} variant="primary" icon={<Crown size={16} aria-hidden="true" />} isLoading={busy}
                onClick={() => { setBusy(true); void upgrade(message => { setError(message); setBusy(false); }); }} />
              <small>Secure payment by Stripe. Pro unlocks as soon as the payment clears.</small>
            </div>}
          {error && <p className="plans-error" role="alert">{error}</p>}
        </div>
      </LayoutContent>} />
  </Dialog>;
}

interface Connector { active: boolean; lastUsed?: string; allowed: boolean }

export function ConnectorDialog({ account, onClose }: { account: TeamAccount; onClose: () => void }) {
  const [status, setStatus] = useState<Connector>();
  const [link, setLink] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  useEffect(() => { void teamRequest<Connector>('connector').then(setStatus, cause => setError(errorMessage(cause))); }, []);
  const create = () => void teamRequest<{ url: string }>('connector-create').then(result => { setLink(result.url); setStatus(current => current && { ...current, active: true }); setError(undefined); },
    cause => setError(errorMessage(cause)));
  const revoke = () => void teamRequest<Connector>('connector-revoke').then(() => { setLink(undefined); setStatus(current => current && { ...current, active: false }); }, cause => setError(errorMessage(cause)));
  return <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} width={640}>
    <Layout header={<DialogHeader title="Claude and ChatGPT connector" subtitle="Work on your SWDR projects from inside Claude or ChatGPT, using your own subscription there." onOpenChange={open => { if (!open) onClose(); }} />}
      content={<LayoutContent>
        <div className="connector">
          <p>The assistant can list your cloud team projects, read scripts and outlines, add outline beats and add scenes — with your role's permissions, and every change shows in line history. Projects on this device only are not visible; share one with <b>Create private copy</b> first.</p>
          {status && !status.allowed ? <div className="plans-cta"><Badge variant="neutral" label="Pro" />
            <span>The connector is part of SWDR Pro ({PRO_PRICE} once, for life).</span>
            <Button label="Get Pro" variant="primary" size="sm" icon={<Crown size={14} aria-hidden="true" />} onClick={() => void upgrade(setError)} /></div>
            : link ? <>
              <label className="connector-link">Your private connector link
                <span><input readOnly value={link} onFocus={event => event.currentTarget.select()} />
                  <Button label={copied ? 'Copied' : 'Copy'} size="sm" variant="secondary" icon={<Copy size={14} aria-hidden="true" />}
                    onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); }} /></span>
                <small>Anyone with this link can act on your projects as you. Keep it private; you can revoke it here at any time.</small>
              </label>
              <ol className="connector-steps">
                <li><b>Claude:</b> Settings → Connectors → Add custom connector. Name it SWDR, paste the link, and add.</li>
                <li><b>ChatGPT:</b> Settings → Apps &amp; Connectors → Advanced settings → turn on Developer mode, then Create. Name it SWDR, paste the link, choose No authentication, and create.</li>
                <li>In a chat, ask something like “List my SWDR projects” or “Read scene 4 of my pilot and give me notes”.</li>
              </ol>
            </>
            : <div className="plans-cta">
              <Button label={status?.active ? 'Create a new link' : 'Create connector link'} variant="primary" icon={<Link2 size={14} aria-hidden="true" />} onClick={create} isDisabled={!status} />
              {status?.active && <small>A link is active{status.lastUsed ? `, last used ${new Date(status.lastUsed).toLocaleString('en-GB')}` : ''}. Links are shown once; creating a new one replaces it.</small>}
            </div>}
          {status?.active && <Button label="Revoke connector link" variant="ghost" size="sm" icon={<Trash2 size={14} aria-hidden="true" />} onClick={revoke} />}
          {error && <p className="plans-error" role="alert">{error}</p>}
          <p className="plans-note"><Plug size={14} aria-hidden="true" /> Signed in as {account.email}.</p>
        </div>
      </LayoutContent>} />
  </Dialog>;
}
