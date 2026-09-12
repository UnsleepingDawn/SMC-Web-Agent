export interface CropArea {
	x: number;
	y: number;
	width: number;
	height: number;
}

const OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.addEventListener("load", () => resolve(image));
		image.addEventListener("error", () => reject(new Error("图片加载失败。")));
		image.src = src;
	});
}

/**
 * Draw the selected square area of the source image onto a canvas and export
 * it as a JPEG blob. The output is always `512x512`.
 */
export async function getCroppedSquareBlob(
	imageSrc: string,
	crop: CropArea,
): Promise<Blob> {
	const image = await loadImage(imageSrc);
	const canvas = document.createElement("canvas");
	canvas.width = OUTPUT_SIZE;
	canvas.height = OUTPUT_SIZE;

	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("无法创建画布。");
	}

	context.imageSmoothingQuality = "high";
	context.drawImage(
		image,
		crop.x,
		crop.y,
		crop.width,
		crop.height,
		0,
		0,
		OUTPUT_SIZE,
		OUTPUT_SIZE,
	);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
					return;
				}
				reject(new Error("图片裁剪失败。"));
			},
			"image/jpeg",
			0.9,
		);
	});
}
