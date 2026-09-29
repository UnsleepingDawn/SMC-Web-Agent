import { toBlob, toPng } from "html-to-image";

/**
 * Export scale. The poster canvases are fixed widths of roughly 1080–1240 px;
 * doubling that keeps the PNG crisp when someone zooms in on a phone.
 */
const DEFAULT_PIXEL_RATIO = 2;

/** Filesystem-hostile characters a semester name could contain. */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * Upper bound on the bitmap a poster export may allocate, in total pixels.
 *
 * html-to-image clones the poster into one canvas before encoding it, and a
 * semester poster listing the whole roster runs to several thousand pixels in
 * height: at the usual 2x that is a ~46 megapixel bitmap, which is enough to
 * stall or fail on a modest machine. The canvases are already over 1000 px
 * wide, so easing the scale back down towards 1x stays readable.
 */
const MAX_EXPORT_PIXELS = 20_000_000;

/**
 * Export scale for a canvas whose size is only known at runtime, i.e. one whose
 * length follows the roster. Short posters keep the full `DEFAULT_PIXEL_RATIO`.
 */
export function posterPixelRatio(node: HTMLElement): number {
	const area = node.offsetWidth * node.offsetHeight;
	if (area <= 0) return DEFAULT_PIXEL_RATIO;
	const fitted = Math.min(DEFAULT_PIXEL_RATIO, Math.sqrt(MAX_EXPORT_PIXELS / area));
	return Math.max(1, Number(fitted.toFixed(2)));
}

/**
 * Rasterisation options shared by every export path. The poster is always
 * light, so an opaque background also keeps viewers that ignore transparency
 * from rendering it black.
 */
const RASTER_OPTIONS = {
	backgroundColor: "#ffffff",
	cacheBust: true,
} as const;

/** `YYYYMMDD` stamp used by every poster filename. */
function dateStamp(now: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

/** Build a stable filename for a downloaded poster. */
export function posterFilename(
	semesterName: string,
	week: number,
	now: Date = new Date(),
): string {
	const safeName = semesterName.replace(UNSAFE_FILENAME_CHARS, "-");
	return `SMC周报统计-${safeName}-第${week}周-${dateStamp(now)}.png`;
}

/** Filename for the semester summary poster, which covers no single week. */
export function semesterPosterFilename(
	semesterName: string,
	now: Date = new Date(),
): string {
	const safeName = semesterName.replace(UNSAFE_FILENAME_CHARS, "-");
	return `SMC学期总结-${safeName}-${dateStamp(now)}.png`;
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
