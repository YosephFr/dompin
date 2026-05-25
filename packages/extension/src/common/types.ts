export interface AnnotationPayload {
  id: string;
  createdAt: number;
  page: PageContext;
  element: ElementContext | null;
  region: RegionContext | null;
  comment: string;
  voiceTranscript?: string;
  attachments?: AnnotationAttachment[];
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

/** Which corner of a region rect the numbered marker anchors to. */
export type RegionCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface RegionContext {
  rect: RectInfo;
  /** Corner where the drag was released; the marker is pinned here. Older pins
   * without this field fall back to the top-right corner. */
  corner?: RegionCorner;
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
  selector: string | null;
  /** Region rect in page/document coordinates (scroll-independent), or null. */
  region: RectInfo | null;
  /** For region pins: corner of the rect the numbered marker anchors to. */
  markerCorner?: RegionCorner;
  commentPreview: string;
  createdAt: number;
}
