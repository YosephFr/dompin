import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PinForPage, Session, SessionListItem, VaultStatus } from '../common/types.js';
import type { ExtensionState } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import { requestRootPermission, saveRootHandle } from '../common/vault-handle.js';
import {
  busyDeleteId,
  busyEditId,
  EMPTY_ORIGIN,
  readOriginTab,
  type Busy,
  type OriginTab,
} from './utils.js';
import { ErrorBanner, Foot, Head, UnreachableBanner } from './components/Chrome.js';
import { ReconnectCard, WizardCard } from './components/WizardCard.js';
import { ActiveSessionCard } from './components/ActiveSessionCard.js';
import { PinListCard } from './components/PinListCard.js';
import { RecentSessionsCard } from './components/RecentSessionsCard.js';
import { PickerHero, type PickerState } from './components/PickerHero.js';

export function App(): JSX.Element {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [origin, setOrigin] = useState<OriginTab>(EMPTY_ORIGIN);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [pins, setPins] = useState<PinForPage[]>([]);
  const [recent, setRecent] = useState<SessionListItem[]>([]);
  const [pickerOn, setPickerOn] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [showOnboardingForced, setShowOnboardingForced] = useState(false);
  const originRef = useRef<OriginTab>(EMPTY_ORIGIN);
  const stateRef = useRef<ExtensionState | null>(null);

  useEffect(() => {
    void bootstrap();
    const onTabActivated = () => void onTabChange();
    const onTabUpdated = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.status === 'complete' && tabId === originRef.current.tabId) {
        void onTabChange();
      }
    };
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender): boolean | undefined => {
      if (!msg || typeof msg !== 'object' || !('kind' in msg)) return false;
      const m = msg as { kind: string; active?: boolean };
      if (m.kind === 'picker:state-broadcast') {
        if (sender.tab?.id === originRef.current.tabId) {
          setPickerOn(Boolean(m.active));
        }
        return false;
      }
      return false;
    };
    chrome.tabs.onActivated.addListener(onTabActivated);
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.runtime.onMessage.addListener(onMessage);
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void refreshPins();
    }, 2000);
    return () => {
      chrome.tabs.onActivated.removeListener(onTabActivated);
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      chrome.runtime.onMessage.removeListener(onMessage);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap(): Promise<void> {
    const tab = await readOriginTab();
    setOrigin(tab);
    originRef.current = tab;
    const resp = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (!resp.ok) {
      setError(resp.error);
      return;
    }
    setState(resp.state);
    stateRef.current = resp.state;
    if (resp.state.vault.configured && !resp.state.vault.needsReconnect) {
      await loadSessionData(resp.state.vault, tab);
    }
    void queryPickerState(tab.tabId);
  }

  async function onTabChange(): Promise<void> {
    const tab = await readOriginTab();
    setOrigin(tab);
    originRef.current = tab;
    const cur = stateRef.current;
    if (cur?.vault.configured && !cur.vault.needsReconnect) {
      await loadSessionData(cur.vault, tab);
    }
    void queryPickerState(tab.tabId);
  }

  async function queryPickerState(tabId: number | null): Promise<void> {
    if (tabId == null) {
      setPickerOn(false);
      return;
    }
    try {
      const r = (await chrome.tabs.sendMessage(tabId, { kind: 'picker:query-state' })) as
        | { ok: true; active: boolean }
        | undefined;
      setPickerOn(Boolean(r?.active));
    } catch {
      setPickerOn(false);
    }
  }

  async function loadSessionData(vault: VaultStatus, tab: OriginTab): Promise<void> {
    if (!vault.configured || vault.needsReconnect) return;
    if (tab.tabId !== null) {
      const r = await sendRequest<{ session: Session | null }>({
        kind: 'session:active',
        tabId: tab.tabId,
      });
      setActiveSession(r.ok ? r.session : null);
    } else {
      setActiveSession(null);
    }
    const listR = await sendRequest<{ sessions: SessionListItem[] }>({
      kind: 'session:list',
      domain: tab.domain ?? undefined,
      limit: 8,
    });
    setRecent(listR.ok ? listR.sessions : []);
    await refreshPins();
  }

  async function refreshPins(): Promise<void> {
    const tab = originRef.current;
    if (tab.tabId === null) {
      setPins([]);
      return;
    }
    const r = await sendRequest<{ pins: PinForPage[] }>({
      kind: 'pins:for-tab',
      tabId: tab.tabId,
    });
    if (r.ok) setPins(r.pins);
  }

  async function refreshState(): Promise<void> {
    const r = await sendRequest<{ state: ExtensionState }>({ kind: 'state:get' });
    if (r.ok) {
      setState(r.state);
      stateRef.current = r.state;
      await loadSessionData(r.state.vault, originRef.current);
    }
  }

  async function pickFolder(): Promise<void> {
    setBusy('pick');
    setError(null);
    try {
      const handle = await window.showDirectoryPicker({ id: 'dompin-vault', mode: 'readwrite' });
      await saveRootHandle(handle);
      const r = await sendRequest<{ vault: VaultStatus }>({
        kind: 'vault:pickRoot',
        rootName: handle.name,
      });
      if (!r.ok) throw new Error(r.error);
      setState((prev) => {
        const next = prev ? { ...prev, vault: r.vault } : prev;
        stateRef.current = next;
        return next;
      });
      setShowOnboardingForced(false);
      await loadSessionData(r.vault, originRef.current);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function reconnect(): Promise<void> {
    setBusy('reconnect');
    setError(null);
    try {
      const granted = await requestRootPermission();
      if (granted === 'granted') {
        const r = await sendRequest<{ vault: VaultStatus }>({ kind: 'vault:request-permission' });
        if (!r.ok) throw new Error(r.error);
        setState((prev) => {
          const next = prev ? { ...prev, vault: r.vault } : prev;
          stateRef.current = next;
          return next;
        });
        await loadSessionData(r.vault, originRef.current);
        return;
      }
      await pickFolder();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function togglePicker(): Promise<void> {
    setBusy('toggle');
    setError(null);
    try {
      const r = await sendRequest({ kind: 'toggle-picker' });
      if (!r.ok) setError(r.error);
    } finally {
      setBusy(null);
    }
  }

  function startNewSession(): void {
    if (state?.settings.flags.promptSessionName) {
      setNewDraft('');
    } else {
      void commitNewSession(null);
    }
  }

  async function commitNewSession(name: string | null): Promise<void> {
    const tab = originRef.current;
    if (tab.tabId === null || tab.url === null) return;
    setBusy('new');
    setError(null);
    try {
      const r = await sendRequest<{ session: Session }>({
        kind: 'session:new',
        tabId: tab.tabId,
        pageUrl: tab.url,
        ...(name ? { name } : {}),
      });
      if (r.ok) {
        setActiveSession(r.session);
        setPins([]);
        await refreshState();
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(null);
      setNewDraft(null);
    }
  }

  function startRename(): void {
    if (!activeSession) return;
    setRenameDraft(activeSession.name);
  }

  async function commitRename(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!activeSession || renameDraft === null) return;
    const name = renameDraft.trim();
    if (!name || name === activeSession.name) {
      setRenameDraft(null);
      return;
    }
    setBusy('rename');
    setError(null);
    try {
      const r = await sendRequest<{ session: Session }>({
        kind: 'session:rename',
        sessionId: activeSession.id,
        newName: name,
      });
      if (r.ok) {
        setActiveSession(r.session);
        await refreshState();
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(null);
      setRenameDraft(null);
    }
  }

  async function endSession(): Promise<void> {
    if (!activeSession) return;
    const ok = window.confirm(
      'End this session? You can start a new one anytime. Your files stay where they are.',
    );
    if (!ok) return;
    setBusy('archive');
    setError(null);
    try {
      const r = await sendRequest({ kind: 'session:archive', sessionId: activeSession.id });
      if (r.ok) {
        setActiveSession(null);
        setPins([]);
        await refreshState();
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(null);
    }
  }

  function startEditPin(pin: PinForPage): void {
    setEditingId(pin.id);
    setEditDraft(pin.commentPreview ?? '');
  }

  async function commitEditPin(): Promise<void> {
    if (!editingId) return;
    setBusy({ kind: 'edit', id: editingId });
    setError(null);
    try {
      const r = await sendRequest({
        kind: 'annotation:edit-comment',
        annotationId: editingId,
        comment: editDraft,
      });
      if (r.ok) {
        await refreshPins();
        setEditingId(null);
        setEditDraft('');
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function deletePin(pin: PinForPage): Promise<void> {
    if (!window.confirm(`Delete annotation #${String(pin.ordinal).padStart(2, '0')}?`)) return;
    setBusy({ kind: 'delete', id: pin.id });
    setError(null);
    try {
      const r = await sendRequest({ kind: 'annotation:cancel', annotationId: pin.id });
      if (r.ok) {
        await refreshPins();
        await refreshState();
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(null);
    }
  }

  function openSettings(): void {
    chrome.runtime.openOptionsPage();
  }

  function showOnboarding(): void {
    setShowOnboardingForced(true);
  }

  function openVaultFolder(): void {
    setError('Chrome does not allow opening folders directly. Open Finder or Explorer manually.');
  }

  if (!state) {
    return (
      <div className="shell">
        <Head
          onOpenSettings={openSettings}
          onShowOnboarding={showOnboarding}
          onOpenVaultFolder={openVaultFolder}
          vaultConfigured={false}
        />
        <div className="loading">Loading…</div>
      </div>
    );
  }

  const vault = state.vault;
  const isVaultReady = vault.configured && !vault.needsReconnect && !vault.unreachable;
  const showWizard = !vault.configured || showOnboardingForced;
  const pickerState: PickerState = pickerOn ? 'on' : 'off';

  return (
    <div className="shell">
      <Head
        onOpenSettings={openSettings}
        onShowOnboarding={showOnboarding}
        onOpenVaultFolder={openVaultFolder}
        vaultConfigured={vault.configured && !vault.unreachable}
      />
      <div className="body">
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        {vault.configured && vault.unreachable ? (
          <UnreachableBanner
            reason={vault.unreachableReason}
            onPickAnother={() => void pickFolder()}
            onReconnect={() => void reconnect()}
          />
        ) : null}

        {showWizard ? (
          <WizardCard busy={busy === 'pick'} onPick={() => void pickFolder()} />
        ) : vault.needsReconnect ? (
          <ReconnectCard
            rootName={vault.rootName}
            busy={busy === 'reconnect'}
            onReconnect={() => void reconnect()}
            onChangeFolder={() => void pickFolder()}
          />
        ) : (
          <>
            <PickerHero
              state={pickerState}
              busy={busy === 'toggle'}
              onToggle={() => void togglePicker()}
            />
            <ActiveSessionCard
              session={activeSession}
              domain={origin.domain}
              busy={busy}
              renameDraft={renameDraft}
              newDraft={newDraft}
              onStartNew={startNewSession}
              onCommitNew={(n) => void commitNewSession(n)}
              onCancelNew={() => setNewDraft(null)}
              onNewDraftChange={setNewDraft}
              onStartRename={startRename}
              onCommitRename={(e) => void commitRename(e)}
              onCancelRename={() => setRenameDraft(null)}
              onRenameDraftChange={setRenameDraft}
              onEndSession={() => void endSession()}
            />
            <PinListCard
              pins={pins}
              editingId={editingId}
              editDraft={editDraft}
              onEditDraftChange={setEditDraft}
              onStartEdit={startEditPin}
              onCommitEdit={() => void commitEditPin()}
              onCancelEdit={() => {
                setEditingId(null);
                setEditDraft('');
              }}
              onDelete={(p) => void deletePin(p)}
              busyEditId={busyEditId(busy)}
              busyDeleteId={busyDeleteId(busy)}
            />
            <RecentSessionsCard items={recent} activeId={activeSession?.id ?? null} />
          </>
        )}
      </div>
      <Foot
        rootName={vault.rootName}
        configured={vault.configured && !vault.needsReconnect}
        unreachable={vault.unreachable}
      />
    </div>
  );
}
