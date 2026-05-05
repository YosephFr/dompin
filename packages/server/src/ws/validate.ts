import { z } from 'zod';

const RectInfoSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .passthrough();

const ViewportInfoSchema = z
  .object({
    width: z.number(),
    height: z.number(),
    devicePixelRatio: z.number(),
  })
  .passthrough();

const ScrollInfoSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .passthrough();

const PageContextSchema = z
  .object({
    url: z.string(),
    title: z.string(),
    userAgent: z.string(),
    viewport: ViewportInfoSchema,
    scroll: ScrollInfoSchema,
    colorScheme: z.enum(['light', 'dark']),
    documentReadyState: z.enum(['loading', 'interactive', 'complete']),
  })
  .passthrough();

const ComputedStyleSubsetSchema = z
  .object({
    layout: z.record(z.string(), z.string()),
    typography: z.record(z.string(), z.string()),
    box: z.record(z.string(), z.string()),
    visual: z.record(z.string(), z.string()),
  })
  .passthrough();

const ReactSourceSchema = z
  .object({
    fileName: z.string(),
    lineNumber: z.number(),
    columnNumber: z.number(),
  })
  .passthrough();

const ReactInfoSchema = z
  .object({
    componentName: z.string().nullable(),
    ownerChain: z.array(z.string()),
    source: ReactSourceSchema.nullable(),
    props: z.record(z.string(), z.unknown()).nullable(),
  })
  .passthrough();

const ElementContextSchema = z
  .object({
    selector: z.string(),
    xpath: z.string(),
    tag: z.string(),
    id: z.string().nullable(),
    classes: z.array(z.string()),
    role: z.string().nullable(),
    ariaLabel: z.string().nullable(),
    textPreview: z.string().nullable(),
    outerHTMLPreview: z.string(),
    boundingRect: RectInfoSchema,
    computedStyles: ComputedStyleSubsetSchema,
    react: ReactInfoSchema.nullable(),
    scrollAncestorSelector: z.string().nullable(),
  })
  .passthrough();

const RegionContextSchema = z
  .object({
    rect: RectInfoSchema,
  })
  .passthrough();

const ScreenshotSetSchema = z
  .object({
    viewport: z.string(),
    zoned: z.string().nullable(),
  })
  .passthrough();

const ConsoleEntrySchema = z
  .object({
    level: z.enum(['log', 'info', 'warn', 'error', 'debug']),
    timestamp: z.number(),
    message: z.string(),
    stack: z.string().optional(),
  })
  .passthrough();

const NetworkEntrySchema = z
  .object({
    url: z.string(),
    method: z.string(),
    status: z.number(),
    durationMs: z.number(),
    timestamp: z.number(),
  })
  .passthrough();

export const AnnotationPayloadSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.number(),
    page: PageContextSchema,
    element: ElementContextSchema.nullable(),
    region: RegionContextSchema.nullable(),
    comment: z.string(),
    voiceTranscript: z.string().optional(),
    screenshots: ScreenshotSetSchema,
    console: z.array(ConsoleEntrySchema),
    network: z.array(NetworkEntrySchema).optional(),
  })
  .passthrough();

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.string().min(1),
    extensionVersion: z.string().min(1),
  }),
  z.object({ type: z.literal('ping') }),
  z.object({
    type: z.literal('annotation:new'),
    payload: AnnotationPayloadSchema,
  }),
  z.object({
    type: z.literal('annotation:cancel'),
    id: z.string().min(1),
  }),
  z.object({
    type: z.literal('queue:replace'),
    payloads: z.array(AnnotationPayloadSchema),
  }),
  z.object({ type: z.literal('queue:clear') }),
]);

export type ParsedExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
