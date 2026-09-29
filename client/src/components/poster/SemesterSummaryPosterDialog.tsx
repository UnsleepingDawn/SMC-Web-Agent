"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	SEMESTER_POSTER_WIDTH,
	SemesterSummaryPoster,
} from "@/components/poster/SemesterSummaryPoster";
import {
	copyElementAsPng,
	downloadElementAsPng,
	posterPixelRatio,
	semesterPosterFilename,
} from "@/lib/posterExport";
import type { RankedSemesterRow } from "@/lib/semesterScore";
import { Semester } from "@/lib/schema";
import { toast } from "sonner";

interface SemesterSummaryPosterDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	semester: Semester;
	endWeek: number | null;
	/** Rows exactly as the page table shows them: filtered, ranked and ordered. */
	rows: RankedSemesterRow[];
	/** Scored rows exactly as the page chart shows them. */
	chartRows: RankedSemesterRow[];
}

interface PosterDialogBodyProps {
	semester: Semester;
	endWeek: number | null;
	rows: RankedSemesterRow[];
	chartRows: RankedSemesterRow[];
	onClose: () => void;
}

/**
 * Preview plus export controls. Unlike the weekly poster this reads no data of
 * its own: the page has already filtered and ranked the rows, so the image is
 * guaranteed to match what is on screen behind the dialog.
 */
function PosterDialogBody({
	semester,
	endWeek,
	rows,
	chartRows,
	onClose,
}: PosterDialogBodyProps) {
	// Fixed at mount so the printed timestamp does not drift on re-render.
	const generatedAt = useMemo(() => new Date(), []);

	const canvasRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [canvasHeight, setCanvasHeight] = useState(0);
	const [isExporting, setIsExporting] = useState(false);
	const [isCopying, setIsCopying] = useState(false);

	// The poster is a fixed width, so the preview shrinks it to whatever room the
	// dialog has. The scale lives on a wrapper: the exported node itself must
	// stay untransformed. Measured in a layout effect so the first paint is
	// already scaled instead of flashing a full-size poster.
	useLayoutEffect(() => {
		const frame = frameRef.current;
		const canvas = canvasRef.current;
		if (!frame || !canvas) return;

		const measure = () => {
			if (frame.clientWidth > 0) {
				setScale(Math.min(1, frame.clientWidth / SEMESTER_POSTER_WIDTH));
			}
			setCanvasHeight(canvas.offsetHeight);
		};
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(frame);
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	// Both export paths rasterise the same node and share one DOM, so they never
	// run at the same time.
	const isBusy = isExporting || isCopying;

	const handleDownload = async () => {
		const node = canvasRef.current;
		if (!node) {
			toast.error("海报还没有准备好，请稍候再试。");
			return;
		}
		setIsExporting(true);
		try {
			// The canvas grows with the roster, so a computed scale keeps a
			// 58-person poster from asking for a ~46 megapixel bitmap.
			await downloadElementAsPng(
				node,
				semesterPosterFilename(semester.name),
				posterPixelRatio(node),
			);
			toast.success("海报已保存到下载目录。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "导出海报失败。");
		} finally {
			setIsExporting(false);
		}
	};

	const handleCopy = async () => {
		const node = canvasRef.current;
		if (!node) {
			toast.error("海报还没有准备好，请稍候再试。");
			return;
		}
		setIsCopying(true);
		try {
			await copyElementAsPng(node, posterPixelRatio(node));
			toast.success("海报已复制到剪贴板，可直接粘贴。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "复制海报失败。");
		} finally {
			setIsCopying(false);
		}
	};

	return (
		<>
			<div className="max-h-[62vh] overflow-y-auto rounded-lg border bg-muted/40 p-4">
				<div ref={frameRef} className="w-full">
					<div className="overflow-hidden" style={{ height: canvasHeight * scale }}>
						<div
							style={{
								transform: `scale(${scale})`,
								transformOrigin: "top left",
							}}
						>
							<SemesterSummaryPoster
								ref={canvasRef}
								semester={semester}
								endWeek={endWeek}
								rows={rows}
								chartRows={chartRows}
								generatedAt={generatedAt}
							/>
						</div>
					</div>
				</div>
			</div>

			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="outline" onClick={onClose} disabled={isBusy}>
					关闭
				</Button>
				<Button variant="secondary" onClick={handleCopy} disabled={isBusy}>
					{isCopying ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<Copy className="mr-2 h-4 w-4" />
					)}
					复制海报
				</Button>
				<Button onClick={handleDownload} disabled={isBusy}>
					{isExporting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<Download className="mr-2 h-4 w-4" />
					)}
					下载图片
				</Button>
			</div>
		</>
	);
}

/** Modal preview of the semester summary poster with PNG export controls. */
export function SemesterSummaryPosterDialog({
	open,
	onOpenChange,
	semester,
	endWeek,
	rows,
	chartRows,
}: SemesterSummaryPosterDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[760px]">
				<DialogHeader>
					<DialogTitle>学期总结海报</DialogTitle>
					<DialogDescription>
						按当前筛选与排序导出，包含综合得分与明细，共 {rows.length} 人。下载或复制后即可分享。
					</DialogDescription>
				</DialogHeader>
				<PosterDialogBody
					semester={semester}
					endWeek={endWeek}
					rows={rows}
					chartRows={chartRows}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
