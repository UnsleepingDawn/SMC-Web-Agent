import { toBlob, toPng } from "html-to-image";

/**
 * Export scale. The poster canvas is 1080 px wide; doubling it keeps the PNG
 * crisp when someone zooms in on a phone.
 */
const DEFAULT_PIXEL_RATIO = 2;

/** Filesystem-hostile characters a semester name could contain. */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * Rasterisation options shared by every export path. The poster is always
 * light, so an opaque background also keeps viewers that ignore transparency
 * from rendering it black.
 */
const RASTER_OPTIONS = {
	backgroundColor: "#ffffff",
	cacheBust: true,
} as const;

/** Build a stable filename for a downloaded poster. */
export function posterFilename(
	semesterName: string,
	week: number,
	now: Date = new Date(),
): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
	const safeName = semesterName.replace(UNSAFE_FILENAME_CHARS, "-");
	return `SMC周报统计-${safeName}-第${week}周-${stamp}.png`;
}

/**
 * Rasterise a DOM node and save it as a PNG download.
 *
 * The caller passes the poster canvas itself, not its scaled preview wrapper:
 * html-to-image clones the node it is given, so a `transform` on an ancestor
 * never reaches the exported image.
 */
export async function downloadElementAsPng(
	node: HTMLElement,
	filename: string,
	pixelRatio = DEFAULT_PIXEL_RATIO,
): Promise<void> {
	const dataUrl = await toPng(node, { pixelRatio, ...RASTER_OPTIONS });

	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = filename;
	link.click();
}

/**
 * Rasterise a DOM node and put the PNG on the system clipboard, so the poster
 * can be pasted straight into a chat window without going through the
 * filesystem.
 *
 * The async Clipboard API treats outbound images as a permissioned capability:
 * Chromium-based browsers accept them, while Firefox has no implementation at
 * all. Chromium additionally requires the document to be focused, so a
 * backgrounded tab fails with `NotAllowedError` instead of doing nothing.
 * Callers get a readable error in either case.
 */
export async function copyElementAsPng(
	node: HTMLElement,
	pixelRatio = DEFAULT_PIXEL_RATIO,
): Promise<void> {
	if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
		throw new Error("当前浏览器不支持复制图片，请改用下载图片。");
	}

	// Rasterised up front so a render failure surfaces with its own message
	// rather than being folded into the clipboard error.
	const blob = await toBlob(node, { pixelRatio, ...RASTER_OPTIONS });
	if (!blob) {
		throw new Error("生成海报图片失败，请改用下载图片。");
	}

	await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
