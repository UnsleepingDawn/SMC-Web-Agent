import { toPng } from "html-to-image";

/**
 * Export scale. The poster canvas is 1080 px wide; doubling it keeps the PNG
 * crisp when someone zooms in on a phone.
 */
const DEFAULT_PIXEL_RATIO = 2;

/** Filesystem-hostile characters a semester name could contain. */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g;

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
	const dataUrl = await toPng(node, {
		pixelRatio,
		// The poster is always light; an opaque background also keeps viewers that
		// ignore transparency from rendering it black.
		backgroundColor: "#ffffff",
		cacheBust: true,
	});

	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = filename;
	link.click();
}
