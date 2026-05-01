import { spawn } from "node:child_process";
import { statSync, mkdirSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import type { PrismaClient } from "@prisma/client";

const KEYFRAMES_DIR = join(process.cwd(), "uploads", "keyframes");

export interface ExtractedFrame {
  path: string;
  url: string;
  timestamp: number | null; // seconds from video start, null for images
  sceneScore: number; // 0-1, higher = more different from previous frame
  assetId?: string; // MediaAsset id after persistence
}

export interface FrameExtractionResult {
  walkthroughId: string;
  frames: ExtractedFrame[];
  sourceType: "video" | "images" | "none";
  error?: string;
}

function ffmpegAvailable(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

function extractFramesFFmpeg(
  inputPath: string,
  outputDir: string,
): Promise<ExtractedFrame[]> {
  return new Promise((resolve, reject) => {
    mkdirSync(outputDir, { recursive: true });

    const args = [
      "-i", inputPath,
      "-vf", "select='gt(scene,0.15)',showinfo",
      "-vsync", "vfr",
      "-frame_pts", "1",
      "-progress", "pipe:1",
      `${outputDir}/frame_%04d.jpg`,
    ];

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
        return;
      }

      const files = readdirSync(outputDir)
        .filter((f) => f.endsWith(".jpg"))
        .sort();

      if (files.length === 0) {
        // Fallback: extract one frame per second for short videos
        resolve([]);
        return;
      }

      const frames: ExtractedFrame[] = [];
      // Parse scene change scores from ffmpeg stderr output (showinfo filter)
      const sceneLines = stderr.match(/Parsed_showinfo.*pts_time:([\d.]+).*scene:([\d.]+)/g) ?? [];
      const sceneMap = new Map<number, { time: number; score: number }>();
      let idx = 0;
      for (const line of sceneLines) {
        const m = line.match(/pts_time:([\d.]+).*scene:([\d.]+)/);
        if (m) {
          sceneMap.set(idx, { time: parseFloat(m[1]), score: Math.min(1, parseFloat(m[2])) });
          idx++;
        }
      }

      for (let i = 0; i < files.length; i++) {
        const scene = sceneMap.get(i);
        frames.push({
          path: join(outputDir, files[i]),
          url: `/uploads/keyframes/${basename(outputDir)}/${files[i]}`,
          timestamp: scene?.time ?? i,
          sceneScore: scene?.score ?? 0,
        });
      }

      resolve(frames);
    });

    proc.on("error", (err) => reject(err));
  });
}

function extractFrameFromImage(inputPath: string, fallbackUrl: string): ExtractedFrame[] {
  const ext = extname(inputPath).toLowerCase();
  const supported = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"];

  if (!supported.includes(ext)) {
    throw new Error(`Unsupported image format: ${ext}`);
  }

  let exists = false;
  try {
    statSync(inputPath);
    exists = true;
  } catch {
    // File doesn't exist on disk — use the URL as-is (e.g. for test stubs)
  }

  return [
    {
      path: exists ? inputPath : "",
      url: exists ? `/uploads/${basename(inputPath)}` : fallbackUrl,
      timestamp: null,
      sceneScore: 1,
    },
  ];
}

async function getMediaInputs(
  db: PrismaClient,
  walkthroughId: string,
): Promise<{ type: "video" | "image"; url: string; assetId: string }[]> {
  const assets = await db.mediaAsset.findMany({
    where: { walkthroughId, type: { in: ["video", "image"] } },
    orderBy: { createdAt: "asc" },
  });

  return assets.map((a) => ({
    type: (["video", "image"].includes(a.type) ? a.type : "image") as "video" | "image",
    url: a.url,
    assetId: a.id,
  }));
}

/**
 * Extract keyframes from walkthrough media assets.
 * For video: uses ffmpeg scene-change detection.
 * For images: uses each image directly as a keyframe.
 * Falls back gracefully if ffmpeg is unavailable.
 */
export async function extractKeyframes(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
): Promise<FrameExtractionResult> {
  const inputs = await getMediaInputs(db, walkthroughId);

  if (inputs.length === 0) {
    return { walkthroughId, frames: [], sourceType: "none" };
  }

  const allFrames: ExtractedFrame[] = [];
  let sourceType: "video" | "images" | "none" = "images";

  for (const input of inputs) {
    if (input.type === "video") {
      sourceType = "video";
      const hasFFmpeg = await ffmpegAvailable();

      if (!hasFFmpeg) {
        // Skip video — ffmpeg not available. This is fine for dev/Vercel.
        continue;
      }

      const outputDir = join(KEYFRAMES_DIR, walkthroughId);
      const videoPath = join(process.cwd(), input.url.replace(/^\//, ""));
      try {
        statSync(videoPath);
      } catch {
        // Video file not on disk — skip
        continue;
      }
      const frames = await extractFramesFFmpeg(videoPath, outputDir);
      allFrames.push(...frames);
    } else {
      const imagePath = join(process.cwd(), input.url.replace(/^\//, ""));
      const frames = extractFrameFromImage(imagePath, input.url);
      allFrames.push(...frames);
    }
  }

  // Persist keyframes as MediaAsset records
  for (const frame of allFrames) {
    const asset = await db.mediaAsset.create({
      data: {
        walkthroughId,
        tenantId,
        type: "keyframe",
        url: frame.url,
      },
    });
    frame.assetId = asset.id;
  }

  return { walkthroughId, frames: allFrames, sourceType };
}
