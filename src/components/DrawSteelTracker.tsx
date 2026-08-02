import { useState } from 'react';
import { DrawSteelState } from '../types';

interface DrawSteelTrackerProps {
  drawSteel: DrawSteelState;
  editable: boolean; // DM window can add/remove/toggle; player window is read-only
  onAddGroup?: (name: string, isPc: boolean) => void;
  onRemoveGroup?: (groupId: string) => void;
  onAddMember?: (groupId: string, name: string) => void;
  onRemoveMember?: (groupId: string, memberId: string) => void;
  onToggleActivated?: (groupId: string) => void;
  onToggleTriggeredAction?: (groupId: string, memberId: string) => void;
  onResetRound?: () => void;
}

// Draw Steel has no rolled initiative order: each round, groups just take
// turns activating (heroes and monsters alike) until everyone's gone. This
// tracker doesn't enforce who goes next — it just lets the DM mark a group
// as activated, and tracks each character's triggered action for the round.
export function DrawSteelTracker({
  drawSteel,
  editable,
  onAddGroup,
  onRemoveGroup,
  onAddMember,
  onRemoveMember,
  onToggleActivated,
  onToggleTriggeredAction,
  onResetRound,
}: DrawSteelTrackerProps) {
  const [groupName, setGroupName] = useState('');
  const [groupIsPc, setGroupIsPc] = useState(false);
  // Per-group "add member" draft text, keyed by group id.
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({});
  // Once you're done adding groups/members, hide the add-forms to reclaim
  // vertical space in the (fixed-width, fixed-height) tracker panel. Purely
  // a view preference — not persisted, and doesn't affect the roster itself.
  const [showAddForms, setShowAddForms] = useState(true);

  const submitAddGroup = () => {
    if (!groupName.trim() || !onAddGroup) return;
    onAddGroup(groupName, groupIsPc);
    setGroupName('');
  };

  const submitAddMember = (groupId: string) => {
    const draft = (memberDrafts[groupId] ?? '').trim();
    if (!draft || !onAddMember) return;
    onAddMember(groupId, draft);
    setMemberDrafts(prev => ({ ...prev, [groupId]: '' }));
  };

  // Heroes first, then monsters; stable order within each side otherwise.
  const groups = [...drawSteel.groups].sort((a, b) => Number(b.isPc) - Number(a.isPc));

  return (
    <>
      <div className="draw-steel-round">
        <span>Round {drawSteel.round}</span>
        {editable && (
          <div className="draw-steel-round-actions">
            <button onClick={onResetRound} title="Reset round count to 1">Reset</button>
            <button onClick={() => setShowAddForms(v => !v)} title={showAddForms ? 'Hide add inputs to save space' : 'Show add inputs'}>
              {showAddForms ? 'Hide inputs' : 'Add…'}
            </button>
          </div>
        )}
      </div>

      <ol className="initiative-list draw-steel-groups">
        {groups.length === 0 && <li className="initiative-empty">No groups yet.</li>}
        {groups.map((group) => (
          <li key={group.id} className={`draw-steel-group${group.activated ? ' activated' : ''}`}>
            <div className="draw-steel-group-header">
              <button
                className="draw-steel-activate"
                onClick={() => editable && onToggleActivated?.(group.id)}
                disabled={!editable}
                title={group.activated ? 'Activated this round' : 'Not yet activated this round'}
              >
                {group.activated ? '✓' : '○'}
              </button>
              <span
                className="initiative-name draw-steel-group-name"
                title={group.isPc ? 'Hero group' : 'Monster group'}
              >
                {group.name}
              </span>
              {editable && (
                <button
                  className="initiative-remove"
                  onClick={() => onRemoveGroup?.(group.id)}
                  title={`Remove ${group.name}`}
                >
                  ×
                </button>
              )}
            </div>

            {group.members.length > 0 && (
              <ul className="draw-steel-members">
                {group.members.map((member) => (
                  <li key={member.id} className="draw-steel-member">
                    <span className="draw-steel-member-name">{member.name}</span>
                    {(editable || member.usedTriggeredAction) && (
                      <button
                        className={`draw-steel-triggered${member.usedTriggeredAction ? ' used' : ''}`}
                        onClick={() => editable && onToggleTriggeredAction?.(group.id, member.id)}
                        disabled={!editable}
                        title={member.usedTriggeredAction ? 'Triggered action used' : 'Triggered action available'}
                      >
                        ⚡
                      </button>
                    )}
                    {editable && (
                      <button
                        className="initiative-remove"
                        onClick={() => onRemoveMember?.(group.id, member.id)}
                        title={`Remove ${member.name}`}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {editable && showAddForms && (
              <div className="draw-steel-add-member">
                <input
                  type="text"
                  placeholder="Add member…"
                  value={memberDrafts[group.id] ?? ''}
                  onChange={(e) => setMemberDrafts(prev => ({ ...prev, [group.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitAddMember(group.id); }}
                />
                <button onClick={() => submitAddMember(group.id)} disabled={!(memberDrafts[group.id] ?? '').trim()}>
                  +
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {editable && showAddForms && (
        <div className="initiative-add">
          <input
            type="text"
            placeholder="Group name (e.g. Goblins)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitAddGroup(); }}
          />
          <div className="initiative-add-row">
            <label className="initiative-pc-label">
              <input type="checkbox" checked={groupIsPc} onChange={(e) => setGroupIsPc(e.target.checked)} />
              <span>Hero group</span>
            </label>
            <button onClick={submitAddGroup} disabled={!groupName.trim()}>Add group</button>
          </div>
        </div>
      )}
    </>
  );
}
