"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { usePosterData } from "@/hooks/usePosterData";
import { downloadElementAsPng, posterFilename } from "@/lib/posterExport";
import { Semester } from "@/lib/schema";
import { toast } from "sonner";
import { POSTER_WIDTH, WeeklyPoster } from "./WeeklyPoster";

interface WeeklyPosterDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	semester: Semester;
	/** Week shown by the poster, matching the dashboard's statistics week. */
	week: number;
	currentWeek: number | null;
	/** Bumped by the dashboard after a sync; forwarded to the data hooks. */
	refreshKey?: number;
}

interface PosterDialogBodyProps {
	semester: Semester;
	week: number;
	currentWeek: number | null;
	refreshKey: number;
	onClose: () => void;
}

/**
 * Preview plus export controls. Mounted only while the dialog is open, so the
 * statistics are fetched on demand rather than on every dashboard visit.
 */
function PosterDialogBody({
	semester,
	week,
	currentWeek,
	refreshKey,
	onClose,
}: PosterDialogBodyProps) {
	const data = usePosterData(semester.id, week, refreshKey);
	// Fixed at mount so the printed timestamp does not drift on re-render.
	const generatedAt = useMemo(() => new Date(), []);

	const canvasRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [canvasHeight, setCanvasHeight] = useState(0);
	const [isExporting, setIsExporting] = useState(false);

	// The poster is a fixed 1080 px wide, so the preview shrinks it to whatever
	// room the dialog has. The scale lives on a wrapper: the exported node itself
	// must stay untransformed. Measured in a layout effect so the first paint is
	// already scaled instead of flashing a full-size poster.
	useLayoutEffect(() => {
		const frame = frameRef.current;
		const canvas = canvasRef.current;
		if (!frame || !canvas) return;

		const measure = () => {
			if (frame.clientWidth > 0) {
				setScale(Math.min(1, frame.clientWidth / POSTER_WIDTH));
			}
			setCanvasHeight(canvas.offsetHeight);
		};
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(frame);
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [data.isLoading]);

	const handleDownload = async () => {
		const node = canvasRef.current;
		if (!node) {
			toast.error("海报还没有准备好，请稍候再试。");
			return;
		}
		setIsExporting(true);
		try {
			await downloadElementAsPng(node, posterFilename(semester.name, week));
			toast.success("海报已保存到下载目录。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "导出海报失败。");
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<>
			{data.error ? (
				<p className="text-sm text-destructive">{data.error.message}</p>
			) : null}

			<div className="max-h-[62vh] overflow-y-auto rounded-lg border bg-muted/40 p-4">
				{data.isLoading ? (
					<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在准备海报...
					</div>
				) : (
					<div ref={frameRef} className="w-full">
						<div className="overflow-hidden" style={{ height: canvasHeight * scale }}>
							<div
								style={{
									transform: `scale(${scale})`,
									transformOrigin: "top left",
								}}
							>
								<WeeklyPoster
									ref={canvasRef}
									semester={semester}
									week={week}
									currentWeek={currentWeek}
									data={data}
									generatedAt={generatedAt}
								/>
							</div>
						</div>
					</div>
				)}
			</div>

			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button variant="outline" onClick={onClose} disabled={isExporting}>
					关闭
				</Button>
				<Button onClick={handleDownload} disabled={isExporting || data.isLoading}>
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

/** Modal preview of the weekly poster with a PNG download button. */
export function WeeklyPosterDialog({
	open,
	onOpenChange,
	semester,
	week,
	currentWeek,
	refreshKey = 0,
}: WeeklyPosterDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[760px]">
				<DialogHeader>
					<DialogTitle>周报统计海报</DialogTitle>
					<DialogDescription>
						第 {week} 周的组会、周报与考勤已排成一张长图，下载后可分享。
					</DialogDescription>
				</DialogHeader>
				<PosterDialogBody
					semester={semester}
					week={week}
					currentWeek={currentWeek}
					refreshKey={refreshKey}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
