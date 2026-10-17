import { z } from "zod";

// Annotation shapes are relayed straight through to the agent's display-only
// overlay, so the backend validates and bounds them here rather than trusting
// whatever a dashboard socket emits. The agent re-parses with serde and the
// helper caps its request line at 64 KiB, but those are backstops - a bad or
// oversized payload should be rejected at the edge, not forwarded on.

// Generous relative to any real freehand markup, tight enough to cap work and
// wire size: a normal session draws a handful of shapes, each well under a few
// thousand sampled points.
const MAX_SHAPES = 200;
const MAX_POINTS_PER_SHAPE = 5000;

const wirePointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const wireShapeSchema = z.object({
  // Mirrors the agent's WireShape (see helper_ipc.rs) and the frontend's Tool
  // union - the agent's overlay only knows how to draw these four.
  tool: z.enum(["pen", "arrow", "rect", "highlight"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb"),
  // Stroke width as a fraction of screen width (0..1); the agent clamps the
  // resulting pixel width to a sane range regardless.
  width: z.number().finite().min(0).max(1),
  points: z.array(wirePointSchema).max(MAX_POINTS_PER_SHAPE),
});

/// Which device a dashboard socket event is about. Sockets have no URL, so
/// every device-specific event names its organization and device in the
/// payload, and the handler authorizes it the same way the REST routes do.
export const deviceTargetSchema = z.object({
  orgId: z.string().min(1),
  deviceId: z.string().min(1),
});

export const streamStopSchema = z.object({
  deviceId: z.string().min(1),
});

export const annotationUpdateSchema = z.object({
  deviceId: z.string().min(1),
  shapes: z.array(wireShapeSchema).max(MAX_SHAPES),
});

export const annotationClearSchema = z.object({
  deviceId: z.string().min(1),
});

export type DeviceTarget = z.infer<typeof deviceTargetSchema>;
export type AnnotationUpdate = z.infer<typeof annotationUpdateSchema>;
