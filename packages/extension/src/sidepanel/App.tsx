import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PinForPage, Session, SessionListItem, VaultStatus } from '../common/types.js';
import type { ExtensionState } from '../common/messaging.js';
import { sendRequest } from '../common/messaging.js';
import { sameView } from '../common/view-url.js';
import { requestRootPermission, saveRootHandle } from '../common/vault-handle.js';
import { I18nProvider, localizeError, resolveLocale, useT } from '../common/i18n/index.js';
import type { LocalePreference, Settings, ThemePreference } from '../common/settings.js';
import { DEFAULT_SETTINGS } from '../common/settings.js';
import { applyTheme } from './theme.js';
import {
  busyDeleteId,
  busyEditId,
  busyResumeId,
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
import { RecordingHero } from './components/RecordingHero.js';
import { DebugHero } from './components/DebugHero.js';

export function App(): JSX.Element {
  const [locale, setLocale] = useState<'en' | 'es'>(() => resolveLocale('auto'));
  return (
    <I18nProvider locale={locale}>
      <AppInner onLocaleResolve={setLocale} />
    </I18nProvider>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForTabView(tabId: number, url: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      window.clearTimeout(timer);
      resolve();
    };
    const onUpdated = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId) return;
      if (typeof info.url === 'string' && sameView(info.url, url)) finish();
      if (info.status === 'complete') {
        void chrome.tabs
          .get(tabId)
          .then((tab) => {
            if (sameView(tab.url, url)) finish();
          })
          .catch(() => finish());
      }
    };
    const timer = window.setTimeout(finish, 4000);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function Loading(): JSX.Element {
  const t = useT();
  return <div className="loading">{t.app.loading}</div>;
}

function AppInner({ onLocaleResolve }: { onLocaleResolve: (l: 'en' | 'es') => void }): JSX.Element {
  const t = useT();
  const [state, setState] = useState<ExtensionState | null>(null);
  const [origin, setOrigin] = useState<OriginTab>(EMPTY_ORIGIN);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [pins, setPins] = useState<PinForPage[]>([]);
  const [recent, setRecent] = useState<SessionListItem[]>([]);
  const [pickerOn, setPickerOn] = useState(false);
  const [markersVisible, setMarkersVisible] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<string | null>(null);
  const [showOnboardingForced, setShowOnboardingForced] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<{
    session: Session;
    tabId: number | null;
  } | null>(null);
  const [sessionFlash, setSessionFlash] = useState(false);
  const originRef = useRef<OriginTab>(EMPTY_ORIGIN);
  const stateRef = useRef<ExtensionState | null>(null);
  const sessionCardRef = useRef<HTMLElement | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!state) return;
    const prefs = state.settings.preferences ?? DEFAULT_SETTINGS.preferences;
    applyTheme(prefs.theme);
    onLocaleResolve(resolveLocale(prefs.locale));
  }, [state, onLocaleResolve]);

  useEffect(() => {
    void bootstrap();
    const onTabActivated = () => void onTabChange();
    const onTabUpdated = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (tabId !== originRef.current.tabId) return;
      // `status: complete` covers hard loads; `info.url` covers SPA route
      // changes that swap the view without a full reload.
      if (info.status === 'complete' || typeof info.url === 'string') {
        void onTabChange();
      }
    };
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender): boolean | undefined => {
      if (!msg || typeof msg !== 'object' || !('kind' in msg)) return false;
      const m = msg as {
        kind: string;
        active?: boolean;
        tabId?: number;
        message?: string;
      };
      if (m.kind === 'picker:state-broadcast') {
        if (sender.tab?.id === originRef.current.tabId) {
          setPickerOn(Boolean(m.active));
        }
        return false;
      }
      if (m.kind === 'picker:needs-session') {
        if (m.tabId == null || m.tabId === originRef.current.tabId) {
          flashSessionCard();
        }
        return false;
      }
      if (m.kind === 'picker:error') {
        if (m.tabId == null || m.tabId === originRef.current.tabId) {
          setError(typeof m.message === 'string' ? m.message : 'PAGE:unknown');
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
      setMarkersVisible(true);
      return;
    }
    try {
      const r = (await chrome.tabs.sendMessage(tabId, { kind: 'picker:query-state' })) as
        | { ok: true; active: boolean; markersVisible?: boolean }
        | undefined;
      setPickerOn(Boolean(r?.active));
      if (typeof r?.markersVisible === 'boolean') setMarkersVisible(r.markersVisible);
    } catch {
      setPickerOn(false);
      setMarkersVisible(true);
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
    if (!activeSession) {
      flashSessionCard();
      return;
    }
    setBusy('toggle');
    setError(null);
    try {
      const r = await sendRequest({ kind: 'toggle-picker', mode: 'sticky' });
      if (!r.ok) setError(r.error);
    } finally {
      setBusy(null);
    }
  }

  async function toggleMarkersVisibility(): Promise<void> {
    const tabId = originRef.current.tabId;
    if (tabId == null) return;
    const next = !markersVisible;
    setMarkersVisible(next);
    try {
      await chrome.tabs.sendMessage(tabId, { kind: 'pins:set-visible', visible: next });
    } catch {
      setMarkersVisible(!next);
      setError('PAGE:needs-refresh');
    }
  }

  function flashSessionCard(): void {
    setSessionFlash(true);
    setTimeout(() => {
      sessionCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setSessionFlash(false);
      flashTimerRef.current = null;
    }, 1800);
  }

  async function stopPickerForTab(): Promise<void> {
    const tabId = originRef.current.tabId;
    if (tabId == null) return;
    try {
      await chrome.tabs.sendMessage(tabId, { kind: 'picker:close' });
    } catch {
      // tab may not have content script
    }
  }

  function startNewSession(): void {
    setNewDraft('');
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

  async function resumeRecentSession(session: SessionListItem): Promise<void> {
    const tab = originRef.current;
    if (tab.tabId === null || tab.url === null) return;
    setBusy({ kind: 'resume', id: session.id });
    setError(null);
    try {
      const r = await sendRequest<{ session: Session }>({
        kind: 'session:resume',
        tabId: tab.tabId,
        sessionId: session.id,
        pageUrl: tab.url,
      });
      if (r.ok) {
        setActiveSession(r.session);
        await refreshState();
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(null);
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
    const ok = window.confirm(t.session.endConfirm);
    if (!ok) return;
    setBusy('archive');
    setError(null);
    try {
      const r = await sendRequest({ kind: 'session:archive', sessionId: activeSession.id });
      if (r.ok) {
        await stopPickerForTab();
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

  async function focusPin(pin: PinForPage): Promise<void> {
    await sendPinCommand(pin, 'pin:focus');
  }

  async function startEditPin(pin: PinForPage): Promise<void> {
    setBusy({ kind: 'edit', id: pin.id });
    setError(null);
    try {
      await sendPinCommand(pin, 'pin:edit');
    } finally {
      setBusy(null);
    }
  }

  async function sendPinCommand(pin: PinForPage, kind: 'pin:focus' | 'pin:edit'): Promise<void> {
    const tabId = originRef.current.tabId;
    if (tabId == null) return;
    if (originRef.current.url && !sameView(originRef.current.url, pin.url)) {
      await chrome.tabs.update(tabId, { url: pin.url });
      await waitForTabView(tabId, pin.url);
      await onTabChange();
      await delay(250);
    }
    const r = await sendRequest({ kind, tabId, annotationId: pin.id });
    if (!r.ok) setError(r.error);
  }

  async function deletePin(pin: PinForPage): Promise<void> {
    if (!window.confirm(t.pins.deleteConfirm(String(pin.ordinal).padStart(2, '0')))) return;
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

  async function persistPreferences(next: Settings['preferences']): Promise<void> {
    const cur = stateRef.current;
    if (!cur) return;
    const settings: Settings = { ...cur.settings, preferences: next };
    setState({ ...cur, settings });
    stateRef.current = { ...cur, settings };
    await sendRequest({ kind: 'settings:save', settings });
  }

  function setThemePref(theme: ThemePreference): void {
    const cur = stateRef.current;
    if (!cur) return;
    applyTheme(theme);
    const prefs = cur.settings.preferences ?? DEFAULT_SETTINGS.preferences;
    void persistPreferences({ ...prefs, theme });
  }

  function setLocalePref(locale: LocalePreference): void {
    const cur = stateRef.current;
    if (!cur) return;
    onLocaleResolve(resolveLocale(locale));
    const prefs = cur.settings.preferences ?? DEFAULT_SETTINGS.preferences;
    void persistPreferences({ ...prefs, locale });
  }

  if (!state) {
    return (
      <div className="shell">
        <Head
          onOpenSettings={openSettings}
          onShowOnboarding={showOnboarding}
          theme="auto"
          onThemeChange={() => undefined}
          locale="auto"
          onLocaleChange={() => undefined}
        />
        <Loading />
      </div>
    );
  }

  const vault = state.vault;
  const pagePins = origin.url ? pins.filter((p) => sameView(p.url, origin.url)) : pins;
  const otherPins = origin.url ? pins.filter((p) => !sameView(p.url, origin.url)) : [];
  const showWizard = !vault.configured || showOnboardingForced;
  const pickerState: PickerState = pickerOn ? 'on' : 'off';
  const sessionDraftOpen = newDraft !== null || renameDraft !== null;
  const showHero = Boolean(activeSession) && !sessionDraftOpen;
  const recordingSession = recordingTarget?.session ?? activeSession;
  const recordingTabId = recordingTarget?.tabId ?? origin.tabId;
  const showRecordingHero =
    Boolean(recordingSession) && (!sessionDraftOpen || Boolean(recordingTarget));

  return (
    <div className="shell">
      <Head
        onOpenSettings={openSettings}
        onShowOnboarding={showOnboarding}
        theme={state.settings.preferences?.theme ?? 'auto'}
        onThemeChange={setThemePref}
        locale={state.settings.preferences?.locale ?? 'auto'}
        onLocaleChange={setLocalePref}
      />
      <div className="body">
        {error ? (
          <ErrorBanner message={localizeError(t, error)} onDismiss={() => setError(null)} />
        ) : null}

        {vault.configured && vault.unreachable ? (
          <UnreachableBanner
            reason={vault.unreachableReason}
            onPickAnother={() => void pickFolder()}
            onReconnect={() => void reconnect()}
          />
        ) : null}

        {showWizard ? (
          <WizardCard
            busy={busy === 'pick'}
            onPick={() => void pickFolder()}
            vaultConfigured={vault.configured}
            onClose={
              vault.configured && showOnboardingForced
                ? () => setShowOnboardingForced(false)
                : undefined
            }
          />
        ) : vault.needsReconnect ? (
          <ReconnectCard
            rootName={vault.rootName}
            busy={busy === 'reconnect'}
            onReconnect={() => void reconnect()}
            onChangeFolder={() => void pickFolder()}
          />
        ) : (
          <>
            <ActiveSessionCard
              ref={sessionCardRef}
              flash={sessionFlash}
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
            {showHero ? (
              <PickerHero
                state={pickerState}
                busy={busy === 'toggle'}
                markersVisible={markersVisible}
                onToggle={() => void togglePicker()}
                onToggleMarkers={() => void toggleMarkersVisibility()}
              />
            ) : null}
            {showRecordingHero && recordingSession ? (
              <RecordingHero
                session={recordingSession}
                tabId={recordingTabId}
                onError={(message) => setError(message || null)}
                onRecordingActiveChange={(active) => {
                  setRecordingTarget(
                    active ? { session: recordingSession, tabId: recordingTabId } : null,
                  );
                }}
              />
            ) : null}
            {showHero && activeSession ? (
              <DebugHero
                session={activeSession}
                tabId={origin.tabId}
                onError={(message) => setError(message || null)}
              />
            ) : null}
            <PinListCard
              currentPins={pagePins}
              otherPins={otherPins}
              onFocus={(p) => void focusPin(p)}
              onStartEdit={(p) => void startEditPin(p)}
              onDelete={(p) => void deletePin(p)}
              busyEditId={busyEditId(busy)}
              busyDeleteId={busyDeleteId(busy)}
            />
            <RecentSessionsCard
              items={recent}
              activeId={activeSession?.id ?? null}
              currentUrl={origin.url}
              busyResumeId={busyResumeId(busy)}
              onResume={(s) => void resumeRecentSession(s)}
            />
          </>
        )}
      </div>
      <Foot
        rootName={vault.rootName}
        configured={vault.configured && !vault.needsReconnect}
        unreachable={vault.unreachable}
        onChangeVault={() => void pickFolder()}
        busyChange={busy === 'pick'}
      />
    </div>
  );
}
