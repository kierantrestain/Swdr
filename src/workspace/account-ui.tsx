import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { KeyRound, LogOut, MailOpen, ShieldCheck, Users, WifiOff } from 'lucide-react';
import { accountApi, hasUnsyncedTeamEdits, roleDescriptions, roleLabels } from './account-api';
import { errorMessage, TeamRequestError } from './team-client';
import type { TeamAccount, TeamConfig, TeamInvitePreview, TeamSignedIn } from './team-contract';
import './team.css';

type AuthTab = 'sign-in' | 'create';

/** A completed sign-in. `inviteUsed` is true when the invitation in the address was consumed. */
export type AuthResult = TeamSignedIn & { inviteUsed?: boolean };

function displayName(account: Pick<TeamAccount, 'email' | 'name'>): string {
  return account.name || account.email;
}

function expiryText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** The "Join <project> as <role>" summary shown for an invitation link. */
export function InvitationSummary({ preview }: { preview: TeamInvitePreview }) {
  const title = preview.projectTitle
    ? <>Join <strong>{preview.projectTitle}</strong> as {preview.role ? roleLabels[preview.role] : 'a member'}</>
    : <>Create your SWDR team account</>;
  return <Card variant="muted" padding={4}>
    <VStack gap={2}>
      <HStack gap={2} align="center">
        <MailOpen size={18} aria-hidden />
        <Heading level={2}>{title}</Heading>
      </HStack>
      <Text type="supporting">
        {preview.invitedBy} invited <strong>{preview.email}</strong>
        {preview.role ? <> · {roleDescriptions[preview.role]}</> : null}
      </Text>
      {preview.episodeTitles && <Text type="supporting">Episodes: {preview.episodeTitles.join(', ')}</Text>}
      <Text type="supporting">This link works once and expires {expiryText(preview.expiresAt)}.</Text>
    </VStack>
  </Card>;
}

function Explainer({ config, invited }: { config?: TeamConfig; invited: boolean }) {
  const points: Array<[ReactNode, string, string]> = [
    [<Users key="u" size={18} aria-hidden />, 'Share a private copy of a project',
      'Create a team copy of a local project. Only the people you invite can open it, with the role you choose: Writer, Reviewer or Viewer.'],
    [<ShieldCheck key="s" size={18} aria-hidden />, 'Episode-level access',
      'Give a writer one episode of a series. They see only those scripts, drafts and storyboard images.'],
    [<WifiOff key="w" size={18} aria-hidden />, 'Keeps working offline',
      'Edits save on this device first and sync when you reconnect. Overlapping changes are kept so nothing is lost.']
  ];
  return <VStack gap={4}>
    <VStack gap={2}>
      <Heading level={1}>SWDR team workspace</Heading>
      <Text type="large" color="secondary">
        Write together on a shared, private copy of a script. Your local projects stay on this device until you choose to share one.
      </Text>
    </VStack>
    {points.map(([icon, title, body]) => <HStack gap={3} key={title} align="start">
      {icon}
      <VStack gap={0.5}>
        <Text weight="semibold">{title}</Text>
        <Text type="supporting">{body}</Text>
      </VStack>
    </HStack>)}
    {config?.signup === 'invite' && !invited && <Text type="supporting">
      This workspace is invite-only. To join, open the invitation link a project owner sent you.
    </Text>}
  </VStack>;
}

/**
 * Sign-in and create-account page for the team route. With an invitation preview it frames the forms as
 * "Join <project> as <role>" and locks the email to the invited address.
 */
export function TeamAuthPage({ config, invite, inviteToken, inviteError, onSignedIn }: {
  config?: TeamConfig;
  invite?: TeamInvitePreview;
  inviteToken?: string;
  inviteError?: string;
  onSignedIn: (result: AuthResult) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<AuthTab>(invite && !invite.accountExists ? 'create' : 'sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invite?.email ?? '');
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [useKey, setUseKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!invite) return;
    setEmail(invite.email);
    setTab(invite.accountExists ? 'sign-in' : 'create');
  }, [invite]);

  const canCreate = config?.signup === 'open' || !!invite;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const work = async (): Promise<AuthResult> => {
      if (tab === 'create' && !useKey) {
        return { ...await accountApi.signUp({ name, email, password, invite: inviteToken }), inviteUsed: !!inviteToken };
      }
      let result: TeamSignedIn;
      if (useKey) {
        const signed = await accountApi.signInWithKey(email, key);
        const account = await accountApi.session().catch(() => undefined);
        result = { account: account ?? { email: signed.email, name: '', method: 'access-key', hasPassword: false } };
      } else {
        result = await accountApi.signIn(email, password);
      }
      // Signing in from an invitation link joins in the same step when the addresses match.
      if (!inviteToken || invite?.email !== result.account.email) return result;
      try {
        return { ...result, projectId: (await accountApi.acceptInvite(inviteToken)).projectId, inviteUsed: true };
      } catch {
        return result;
      }
    };
    void work().then(onSignedIn, (cause: unknown) => {
      setError(cause instanceof TeamRequestError && cause.status === 0 ? 'SWDR is offline. Connect to sign in.' : errorMessage(cause));
    }).finally(() => setBusy(false));
  };

  const lockedEmail = !!invite && !useKey;
  return <main className="team-ax team-auth-page" id="main-content">
    <section className="team-auth-intro" aria-label="About team workspaces"><Explainer config={config} invited={!!invite} /></section>
    <section className="team-auth-card" aria-label={tab === 'create' ? 'Create account' : 'Sign in'}>
      <Card padding={6} elevation="low">
        <VStack gap={4}>
          {invite && <InvitationSummary preview={invite} />}
          {inviteError && <Banner status="warning" title="This invitation cannot be used" description={inviteError} collapsible={false} />}
          {!useKey && <TabList value={tab} onChange={value => { setTab(value as AuthTab); setError(undefined); }} layout="fill" hasDivider role="tablist">
            <Tab value="sign-in" label="Sign in" />
            <Tab value="create" label="Create account" />
          </TabList>}
          {useKey && <Heading level={2}>Sign in with a team access key</Heading>}
          {tab === 'create' && !useKey && !canCreate
            ? <Banner status="info" title="Accounts are by invitation" collapsible={false}
              description="This workspace is private. Ask a project owner to invite you, then open the link they send you to create your account." />
            : <form className="team-ax-form" onSubmit={submit} noValidate>
              <VStack gap={3}>
                {tab === 'create' && !useKey && <TextInput label="Your name" value={name} onChange={setName} autoComplete="name" isRequired />}
                <TextInput label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" isRequired
                  isReadOnly={lockedEmail} description={lockedEmail ? 'Invitations are tied to the address they were sent to.' : undefined} />
                {useKey
                  ? <TextInput label="Team access key" type="password" value={key} onChange={setKey} autoComplete="current-password" isRequired />
                  : <TextInput label="Password" type="password" value={password} onChange={setPassword} isRequired
                    autoComplete={tab === 'create' ? 'new-password' : 'current-password'}
                    description={tab === 'create' ? 'At least 10 characters. A short phrase is easy to remember and hard to guess.' : undefined} />}
                {error && <Banner status="error" title={error} collapsible={false} />}
                <Button type="submit" variant="primary" isLoading={busy} width="100%"
                  label={useKey ? 'Sign in' : tab === 'create' ? (invite?.projectTitle ? 'Create account and join' : 'Create account') : (invite?.projectTitle ? 'Sign in and join' : 'Sign in')} />
              </VStack>
            </form>}
          {config?.accessKeys && <Button variant="ghost" icon={<KeyRound size={16} aria-hidden />}
            label={useKey ? 'Use email and password instead' : 'Use a team access key'}
            onClick={() => { setUseKey(!useKey); setError(undefined); }} />}
        </VStack>
      </Card>
    </section>
  </main>;
}

/** Shown to a signed-in person who opened an invitation link. */
export function InvitationPrompt({ preview, account, busy, onAccept, onDismiss, onSignOut }: {
  preview: TeamInvitePreview;
  account: TeamAccount;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onSignOut: () => void;
}) {
  const matches = preview.email === account.email;
  return <section className="team-ax team-invite-prompt" aria-label="Invitation">
    <Card padding={5} elevation="low">
      <VStack gap={3}>
        <InvitationSummary preview={preview} />
        {matches
          ? <HStack gap={2} wrap="wrap">
            <Button variant="primary" isLoading={busy} onClick={onAccept}
              label={preview.projectTitle ? `Join ${preview.projectTitle}` : 'Accept invitation'} />
            <Button variant="secondary" label="Not now" onClick={onDismiss} />
          </HStack>
          : <Banner status="warning" collapsible={false}
            title={`This invitation was sent to ${preview.email}`}
            description={`You are signed in as ${account.email}. Sign out, then open the link again and sign in with the invited address.`}
            endContent={<Button size="sm" label="Sign out" onClick={onSignOut} />} />}
      </VStack>
    </Card>
  </section>;
}

function SetPasswordDialog({ account, isOpen, onClose, onSaved }: {
  account: TeamAccount; isOpen: boolean; onClose: () => void; onSaved: (account: TeamAccount) => void;
}) {
  const [name, setName] = useState(account.name);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return <Dialog isOpen={isOpen} onOpenChange={open => { if (!open) onClose(); }} purpose="form" width={440}>
    <form onSubmit={event => {
      event.preventDefault();
      setBusy(true);
      void accountApi.setPassword(password, name).then(onSaved, cause => setError(errorMessage(cause))).finally(() => setBusy(false));
    }}>
      <Layout height="auto"
        header={<DialogHeader title="Add a password" subtitle="Sign in with your email and a password instead of the access key." onOpenChange={onClose} />}
        content={<LayoutContent><VStack gap={3}>
          <TextInput label="Your name" value={name} onChange={setName} autoComplete="name" />
          <TextInput label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password"
            description="At least 10 characters." isRequired />
          {error && <Banner status="error" title={error} collapsible={false} />}
        </VStack></LayoutContent>}
        footer={<LayoutFooter><HStack gap={2} hAlign="end">
          <Button label="Cancel" onClick={onClose} />
          <Button type="submit" variant="primary" label="Save password" isLoading={busy} />
        </HStack></LayoutFooter>} />
    </form>
  </Dialog>;
}

/** The signed-in person's menu: who they are, and sign out. */
export function AccountMenu({ account, onSignOut, onAccountChange }: {
  account: TeamAccount;
  onSignOut: () => void;
  onAccountChange?: (account: TeamAccount) => void;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  return <>
    <DropdownMenu
      button={{ label: displayName(account), variant: 'secondary', size: 'sm' }}
      alignment="end"
      menuWidth={260}
      header={<VStack gap={0.5} padding={2}>
        <Text weight="semibold">{displayName(account)}</Text>
        <Text type="supporting">{account.email}</Text>
        <HStack gap={1}><Badge label={account.method === 'password' ? 'Password' : 'Access key'} /></HStack>
      </VStack>}
      items={[
        ...(!account.hasPassword && onAccountChange ? [{ label: 'Add a password', icon: <KeyRound size={16} aria-hidden />, onClick: () => setPasswordOpen(true) }] : []),
        { label: 'Sign out', icon: <LogOut size={16} aria-hidden />, onClick: onSignOut }
      ]}
    />
    {passwordOpen && onAccountChange && <SetPasswordDialog account={account} isOpen onClose={() => setPasswordOpen(false)}
      onSaved={next => { setPasswordOpen(false); onAccountChange(next); }} />}
  </>;
}

/**
 * Self-contained account control for the app shell. Shows the team account and a sign-out item, or a
 * "Team sign in" button that calls `onOpenTeam` (route to `#team`). It refuses to sign out while the
 * cached team draft still has unsynced edits.
 */
export function TeamAccountMenu({ onOpenTeam, onMessage }: { onOpenTeam: () => void; onMessage?: (message: string) => void }) {
  const [account, setAccount] = useState<TeamAccount | null>();
  useEffect(() => {
    let live = true;
    accountApi.session().then(value => { if (live) setAccount(value); }, () => { if (live) setAccount(null); });
    return () => { live = false; };
  }, []);
  if (account === undefined) return null;
  if (!account) return <Button size="sm" variant="secondary" icon={<Users size={16} aria-hidden />} label="Team sign in" onClick={onOpenTeam} />;
  return <AccountMenu account={account} onAccountChange={setAccount} onSignOut={() => {
    void (async () => {
      if (await hasUnsyncedTeamEdits()) {
        onMessage?.('Open the team workspace and let pending edits sync before signing out.');
        return;
      }
      await accountApi.signOut().catch(() => undefined);
      setAccount(null);
    })();
  }} />;
}
