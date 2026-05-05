export interface AnnotationPayload {
  id: string;
  createdAt: number;
  page: PageContext;
  element: ElementContext | null;
  region: RegionContext | null;
  comment: string;
  voiceTranscript?: string;
  screenshots: ScreenshotSet;
  console: ConsoleEntry[];
  network?: NetworkEntry[];
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
}

export type AnnotationId = string;

export interface VaultStatus {
  configured: boolean;
  rootName: string | null;
  hasPermission: boolean;
  needsReconnect: boolean;
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
  selector: string | null;
  region: RectInfo | null;
  commentPreview: string;
  createdAt: number;
}
