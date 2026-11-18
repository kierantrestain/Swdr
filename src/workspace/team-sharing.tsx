import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { useClipboard } from '@astryxdesign/core/hooks';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Table } from '@astryxdesign/core/Table';
import type { TableColumn } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Check, Copy, UserPlus } from 'lucide-react';
import type { Project } from '../model';
import { accountApi, inviteLink, roleDescriptions, roleLabels, scopeLabel } from './account-api';
import { errorMessage } from './team-client';
import type { TeamInvitation, TeamInviteIssued, TeamMember, TeamRole } from './team-contract';
import './team.css';

const roleOrder: TeamRole[] = ['editor', 'reviewer', 'viewer', 'owner'];
const roleOptions = roleOrder.map(role => ({ value: role, label: roleLabels[role], description: roleDescriptions[role] }));

function relative(iso: string | null): string {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Whole project, or a set of episodes. Episode scope only applies to projects with episodes. */
function ScopeFields({ project, value, onChange }: {
  project: Project; value: string[] | null; onChange: (value: string[] | null) => void;
}) {
  if (!project.episodes.length) return null;
  return <VStack gap={2}>
    <Selector label="Access to" value={value ? 'episodes' : 'all'}
      options={[
        { value: 'all', label: 'Whole project', description: 'Every episode, story and production notes' },
        { value: 'episodes', label: 'Selected episodes', description: 'Only the scripts and drafts of chosen episodes' }
      ]}
      onChange={next => onChange(next === 'all' ? null : value ?? [project.episodes[0].id])} />
    {value && <VStack isScrollable height={project.episodes.length > 6 ? 260 : undefined}>
      <CheckboxList label="Episodes" value={value} onChange={onChange} hasDividers density="compact">
        {project.episodes.map(episode => <CheckboxListItem key={episode.id} value={episode.id}
          label={`S${episode.season} · E${episode.number} · ${episode.title}`} />)}
      </CheckboxList>
    </VStack>}
  </VStack>;
}

function InviteDialog({ project, onClose, onIssued }: {
  project: Project; onClose: () => void; onIssued: (issued: TeamInviteIssued) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('editor');
  const [scope, setScope] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  return <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} purpose="form" width={520}>
    <form onSubmit={event => {
      event.preventDefault();
      if (scope && !scope.length) {
        setError('Choose at least one episode.');
        return;
      }
      setBusy(true);
      setError(undefined);
      void accountApi.invite(project.id, email, role, role === 'owner' ? null : scope)
        .then(onIssued, cause => setError(errorMessage(cause)))
        .finally(() => setBusy(false));
    }}>
      <Layout height="auto"
        header={<DialogHeader title="Invite people" subtitle={`Share “${project.title}” with a role and, for a series, chosen episodes.`} onOpenChange={onClose} />}
        content={<LayoutContent><VStack gap={4}>
          <TextInput label="Email" type="email" value={email} onChange={setEmail} placeholder="writer@example.com" isRequired hasAutoFocus />
          <Selector label="Role" value={role} options={roleOptions} onChange={value => setRole(value as TeamRole)} />
          {role !== 'owner' && <ScopeFields project={project} value={scope} onChange={setScope} />}
          <Text type="supporting">SWDR does not send email. After you create the invitation, copy the link and send it to them yourself.</Text>
          {error && <Banner status="error" title={error} collapsible={false} />}
        </VStack></LayoutContent>}
        footer={<LayoutFooter><HStack gap={2} hAlign="end">
          <Button label="Cancel" onClick={onClose} />
          <Button type="submit" variant="primary" label="Create invitation link" isLoading={busy} />
        </HStack></LayoutFooter>} />
    </form>
  </Dialog>;
}

function LinkDialog({ issued, onClose }: { issued: TeamInviteIssued; onClose: () => void }) {
  const { copy, isCopied } = useClipboard({ announce: 'Invitation link copied' });
  const link = inviteLink(issued.token);
  const expires = new Date(issued.invitation.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} width={560}>
    <Layout height="auto"
      header={<DialogHeader title="Copy the link and send it" subtitle={`Invitation for ${issued.invitation.email} as ${roleLabels[issued.invitation.role]}`} onOpenChange={onClose} />}
      content={<LayoutContent><VStack gap={3}>
        <Text>SWDR has no email service, so send this link yourself — by email or chat — to <strong>{issued.invitation.email}</strong>.
          It works once, only for that address, and expires {expires}.</Text>
        <HStack gap={2} align="end">
          <TextInput label="Invitation link" value={link} isReadOnly width="100%" />
          <Button variant="primary" label={isCopied ? 'Copied' : 'Copy link'}
            icon={isCopied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} onClick={() => { void copy(link); }} />
        </HStack>
        <Text type="supporting">SWDR keeps only a fingerprint of this link. If it is lost, re-issue the invitation to get a new one.</Text>
      </VStack></LayoutContent>}
      footer={<LayoutFooter><HStack hAlign="end"><Button label="Done" onClick={onClose} /></HStack></LayoutFooter>} />
  </Dialog>;
}

function ScopeDialog({ project, member, onClose, onSave }: {
  project: Project; member: TeamMember; onClose: () => void; onSave: (scope: string[] | null) => Promise<void>;
}) {
  const [scope, setScope] = useState(member.episodeIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return <Dialog isOpen onOpenChange={open => { if (!open) onClose(); }} purpose="form" width={480}>
    <Layout height="auto"
      header={<DialogHeader title="Change episode access" subtitle={member.name || member.email} onOpenChange={onClose} />}
      content={<LayoutContent><VStack gap={3}>
        <ScopeFields project={project} value={scope} onChange={setScope} />
        {error && <Banner status="error" title={error} collapsible={false} />}
      </VStack></LayoutContent>}
      footer={<LayoutFooter><HStack gap={2} hAlign="end">
        <Button label="Cancel" onClick={onClose} />
        <Button variant="primary" label="Save access" isLoading={busy} clickAction={async () => {
          if (scope && !scope.length) {
            setError('Choose at least one episode.');
            return;
          }
          setBusy(true);
          try {
            await onSave(scope);
          } catch (cause) {
            setError(errorMessage(cause));
          } finally {
            setBusy(false);
          }
        }} />
      </HStack></LayoutFooter>} />
  </Dialog>;
}

interface MemberRow extends TeamMember, Record<string, unknown> {}
interface InvitationRow extends TeamInvitation, Record<string, unknown> {}

/**
 * "Team & sharing" for a team project: members with role, episode scope and last activity, pending
 * invitations, and the invite flow. Owners only; the service enforces the same rule.
 */
export function TeamSharingPanel({ project, ownEmail, disabled }: { project: Project; ownEmail: string; disabled?: boolean }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<TeamInviteIssued>();
  const [removing, setRemoving] = useState<TeamMember>();
  const [scoping, setScoping] = useState<TeamMember>();
  const [busy, setBusy] = useState(false);

  // Every change bumps the revision so a background refresh that started earlier cannot undo it on screen.
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const started = revision.current;
    const [nextMembers, nextInvitations] = await Promise.all([accountApi.members(project.id), accountApi.invitations(project.id)]);
    if (started !== revision.current) return;
    // Keep the same arrays when nothing changed, so an open role menu is not re-rendered under the pointer.
    const same = <T,>(next: T) => (current: T) => JSON.stringify(current) === JSON.stringify(next) ? current : next;
    setMembers(same(nextMembers));
    setInvitations(same(nextInvitations));
    setLoaded(true);
  }, [project.id]);

  useEffect(() => {
    refresh().catch(cause => setError(errorMessage(cause)));
    // Accepted invitations and new activity appear without reopening the panel.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh().catch(() => undefined); }, 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const act = async (work: () => Promise<void>) => {
    revision.current++;
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const updateMember = (member: TeamMember, role: TeamRole | null, scope: string[] | null) =>
    accountApi.setMember(project.id, member.email, role, role === 'owner' ? null : scope).then(next => {
      revision.current++;
      setMembers(next);
    });

  const memberColumns: TableColumn<MemberRow>[] = [
    {
      key: 'name', header: 'Member',
      renderCell: member => <VStack gap={0}>
        <Text weight="medium">{member.name || member.email}{member.email === ownEmail ? ' (you)' : ''}</Text>
        {member.name && <Text type="supporting">{member.email}</Text>}
      </VStack>
    },
    {
      key: 'role', header: 'Role',
      renderCell: member => member.email === ownEmail
        ? <Badge label={roleLabels[member.role]} />
        : <Selector label={`Role for ${member.email}`} isLabelHidden size="sm" value={member.role} options={roleOptions}
          isDisabled={disabled} onChange={value => { void act(() => updateMember(member, value as TeamRole, member.episodeIds)); }} />
    },
    {
      key: 'episodeIds', header: 'Access',
      renderCell: member => <HStack gap={2} align="center" wrap="wrap">
        <Text type="supporting">{scopeLabel(member, project.episodes)}</Text>
        {project.episodes.length > 0 && member.role !== 'owner' && member.email !== ownEmail &&
          <Button size="sm" variant="ghost" label="Change" isDisabled={disabled} onClick={() => setScoping(member)} />}
      </HStack>
    },
    { key: 'lastActiveAt', header: 'Last active', renderCell: member => <Text type="supporting">{relative(member.lastActiveAt)}</Text> },
    {
      key: 'email', header: '', align: 'end',
      renderCell: member => member.email === ownEmail ? null
        : <Button size="sm" variant="ghost" label="Remove" isDisabled={disabled} onClick={() => setRemoving(member)} />
    }
  ];

  const invitationColumns: TableColumn<InvitationRow>[] = [
    { key: 'email', header: 'Email', renderCell: item => <Text>{item.email}</Text> },
    { key: 'role', header: 'Role', renderCell: item => <Badge label={roleLabels[item.role]} /> },
    { key: 'episodeIds', header: 'Access', renderCell: item => <Text type="supporting">{scopeLabel(item, project.episodes)}</Text> },
    {
      key: 'expiresAt', header: 'Expires',
      renderCell: item => item.expired ? <Badge variant="warning" label="Expired" />
        : <Text type="supporting">{new Date(item.expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</Text>
    },
    {
      key: 'id', header: '', align: 'end',
      renderCell: item => <HStack gap={1} hAlign="end">
        <Button size="sm" variant="ghost" label="Re-issue link" isDisabled={disabled} clickAction={() => act(async () => {
          setIssued(await accountApi.reissueInvite(project.id, item.id));
          await refresh();
        })} />
        <Button size="sm" variant="ghost" label="Revoke" isDisabled={disabled} clickAction={() => act(async () => {
          setInvitations(await accountApi.revokeInvite(project.id, item.id));
        })} />
      </HStack>
    }
  ];

  return <section className="team-ax team-sharing" aria-label="Team and sharing">
    <VStack gap={4}>
      <HStack gap={3} align="center" justify="between" wrap="wrap">
        <VStack gap={0.5}>
          <Heading level={2}>Team &amp; sharing</Heading>
          <Text type="supporting">People with access to “{project.title}”. Invite someone with a link; change a role or remove access at any time.</Text>
        </VStack>
        <Button variant="primary" icon={<UserPlus size={16} aria-hidden />} label="Invite people" isDisabled={disabled} onClick={() => setInviting(true)} />
      </HStack>
      {error && <Banner status="error" title={error} collapsible={false} isDismissable onDismiss={() => setError(undefined)} />}
      <Table<MemberRow> data={members as MemberRow[]} columns={memberColumns} idKey="email" density="compact" />
      <VStack gap={2}>
        <Heading level={3}>Pending invitations</Heading>
        {loaded && invitations.length === 0
          ? <Text type="supporting">No pending invitations.</Text>
          : <Table<InvitationRow> data={invitations as InvitationRow[]} columns={invitationColumns} idKey="id" density="compact" />}
      </VStack>
    </VStack>
    {inviting && <InviteDialog project={project} onClose={() => setInviting(false)} onIssued={next => {
      setInviting(false);
      setIssued(next);
      void refresh().catch(cause => setError(errorMessage(cause)));
    }} />}
    {issued && <LinkDialog issued={issued} onClose={() => setIssued(undefined)} />}
    {scoping && <ScopeDialog project={project} member={scoping} onClose={() => setScoping(undefined)} onSave={async scope => {
      await updateMember(scoping, scoping.role, scope);
      setScoping(undefined);
    }} />}
    {removing && <AlertDialog isOpen onOpenChange={open => { if (!open) setRemoving(undefined); }}
      title={`Remove ${removing.name || removing.email}?`}
      description={`They lose access to “${project.title}” immediately, including any copy cached on their device the next time it syncs. Pending invitations for ${removing.email} are revoked.`}
      actionLabel="Remove access" isActionLoading={busy}
      onAction={() => {
        setBusy(true);
        void act(async () => {
          await updateMember(removing, null, null);
          setInvitations(await accountApi.invitations(project.id));
        }).finally(() => { setBusy(false); setRemoving(undefined); });
      }} />}
  </section>;
}
