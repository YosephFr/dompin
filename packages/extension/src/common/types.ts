export interface AnnotationPayload {
  id: string;
  createdAt: number;
  page: PageContext;
  element: ElementContext | null;
  region: RegionContext | null;
  comment: string;
  voiceTranscript?: string;
  attachments?: AnnotationAttachment[];
  recording?: AnnotationRecordingContext;
  screenshots: ScreenshotSet;
  console: ConsoleEntry[];
  network?: NetworkEntry[];
}

export interface AnnotationRecordingContext {
  startedAt: number;
  capturedAt: number;
  elapsedMs: number;
}

export interface PageContext {
  url: string;
  title: string;
  userAgent: string;
  viewport: ViewportInfo;
  scroll: ScrollInfo;
  colorScheme: 'light' | 'dark';
  documentReadyState: DocumentReadyState;
}

export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface ScrollInfo {
  x: number;
  y: number;
}

export interface ElementContext {
  selector: string;
  xpath: string;
  tag: string;
  id: string | null;
  classes: string[];
  role: string | null;
  ariaLabel: string | null;
  textPreview: string | null;
  outerHTMLPreview: string;
  boundingRect: RectInfo;
  computedStyles: ComputedStyleSubset;
  react: ReactInfo | null;
  scrollAncestorSelector: string | null;
}

export interface RegionContext {
  rect: RectInfo;
  elements?: ElementContext[];
}

export interface AnnotationAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  path?: string;
  bytes?: number;
}

export interface RectInfo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputedStyleSubset {
  layout: Record<string, string>;
  typography: Record<string, string>;
  box: Record<string, string>;
  visual: Record<string, string>;
}

export interface ReactInfo {
  componentName: string | null;
  ownerChain: string[];
  source: ReactSource | null;
  props: Record<string, unknown> | null;
}

export interface ReactSource {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

export interface ScreenshotSet {
  viewport: string;
  element: string | null;
}

export interface ConsoleEntry {
  level: ConsoleLevel;
  timestamp: number;
  message: string;
  stack?: string;
}

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  timestamp: number;
  error?: string;
}

export interface DebugClickTarget {
  selector: string | null;
  xpath: string | null;
  tag: string;
  id: string | null;
  classes: string[];
  role: string | null;
  ariaLabel: string | null;
  textPreview: string | null;
  outerHTMLPreview: string;
  boundingRect: RectInfo;
  computedStyles?: ComputedStyleSubset | null;
  react?: ReactInfo | null;
  scrollAncestorSelector?: string | null;
}

export interface DebugContentViewEvent {
  type: 'view';
  timestamp: number;
  trigger: 'start' | 'url-change' | 'reload';
  previousUrl?: string | null;
  page: PageContext;
}

export interface DebugContentClickEvent {
  type: 'click';
  timestamp: number;
  page: PageContext;
  pointer: {
    x: number;
    y: number;
    button: number;
    buttons: number;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  };
  target: DebugClickTarget | null;
}

export interface DebugInputInfo {
  inputType: string | null;
  valueLength: number | null;
  checked: boolean | null;
  selectedIndex: number | null;
  selectedTextPreview: string | null;
}

export interface DebugContentFormEvent {
  type: 'input' | 'change' | 'submit';
  timestamp: number;
  page: PageContext;
  target: DebugClickTarget | null;
  input: DebugInputInfo | null;
}

export type DebugContentEvent =
  | DebugContentViewEvent
  | DebugContentClickEvent
  | DebugContentFormEvent;

export type RecordingFrameMarkSource = 'page-click' | 'global-command';

export interface RecordingFrameMark {
  id: string;
  sessionId: string;
  source: RecordingFrameMarkSource;
  timestamp: number;
  startedAt: number;
  elapsedMs: number;
  page: PageContext | null;
  pointer: DebugContentClickEvent['pointer'] | null;
  target: DebugClickTarget | null;
}

export interface RecordingSessionStatus {
  active: boolean;
  sessionId: string | null;
  sessionName: string | null;
  startedAt: number | null;
  elapsedMs: number;
  paused: boolean;
  markCount: number;
}

export interface DebugCaptureStatus {
  active: boolean;
  sessionId: string | null;
  startedAt: number | null;
  elapsedMs: number;
  eventCount: number;
  networkCount: number;
  consoleCount: number;
  lastError: string | null;
}

export type AnnotationId = string;

export interface VaultStatus {
  configured: boolean;
  rootName: string | null;
  hasPermission: boolean;
  needsReconnect: boolean;
  unreachable: boolean;
  unreachableReason: string | null;
  totalSessions: number;
  totalAnnotations: number;
}

export type SessionStatus = 'active' | 'archived';

export interface Session {
  id: string;
  domain: string;
  domainFolder: string;
  name: string;
  folder: string;
  startedAt: number;
  lastWriteAt: number | null;
  annotationCount: number;
  status: SessionStatus;
}

export interface SessionListItem extends Session {
  pageUrl: string | null;
  pageTitle: string | null;
  pageUrls: string[];
}

export interface AnnotationRecord {
  ordinal: number;
  sessionId: string;
  payload: AnnotationPayload;
  files: WrittenFile[];
}

export interface WrittenFile {
  relativePath: string;
  bytes: number;
}

export interface PinForPage {
  id: string;
  ordinal: number;
  /** URL of the view this pin was captured on, used to scope markers per view. */
  url: string;
  pageTitle: string;
  selector: string | null;
  /** Region rect in page/document coordinates (scroll-independent), or null. */
  region: RectInfo | null;
  comment: string;
  commentPreview: string;
  voiceTranscript?: string;
  attachments?: AnnotationAttachment[];
  createdAt: number;
}
