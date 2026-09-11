"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { createSemester, updateSemester } from "@/lib/api";
import { Semester, WEEKDAY_NAMES } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ITEM_HEIGHT = 32;
const VISIBLE_ITEMS = 5;
const WHEEL_PADDING = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT;
const SNAP_DURATION = 150;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

function parseTimeInput(raw: string): string | null {
	const text = raw.trim().replace(/：/g, ":").replace(/[.\s]/g, ":");
	let hours: number;
	let minutes = 0;
	if (text.includes(":")) {
		const [hourPart, minutePart = ""] = text.split(":");
		if (!/^\d{1,2}$/.test(hourPart) || (minutePart && !/^\d{1,2}$/.test(minutePart))) {
			return null;
		}
		hours = Number(hourPart);
		minutes = minutePart ? Number(minutePart) : 0;
	} else {
		if (!/^\d{1,4}$/.test(text)) return null;
		if (text.length <= 2) {
			hours = Number(text);
		} else if (text.length === 3) {
			hours = Number(text.slice(0, 1));
			minutes = Number(text.slice(1));
		} else {
			hours = Number(text.slice(0, 2));
			minutes = Number(text.slice(2));
		}
	}
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

function hhmmToDisplay(value: string): string {
	const parsed = parseTimeInput(value);
	if (!parsed) return "";
	return `${parsed.slice(0, 2)}:${parsed.slice(2)}`;
}

function digitsToDisplay(digits: string): string {
	if (digits.length <= 2) return digits;
	return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function clampIndex(value: number, max: number): number {
	return Math.min(Math.max(value, 0), max);
}

interface WheelColumnProps {
	items: number[];
	value: number;
	onChange: (value: number) => void;
	disabled?: boolean;
}

function WheelColumn({ items, value, onChange, disabled }: WheelColumnProps) {
	const index = Math.max(items.indexOf(value), 0);
	const wheelRef = useRef<HTMLDivElement>(null);
	const offsetRef = useRef(index);
	const dragRef = useRef({ active: false, startY: 0, startOffset: 0 });
	const settleTimer = useRef<number | null>(null);
	const disabledRef = useRef(disabled);
	const [offset, setOffset] = useState(index);
	const [snapping, setSnapping] = useState(true);

	const applyOffset = (next: number) => {
		const clamped = clampIndex(next, items.length - 1);
		offsetRef.current = clamped;
		setOffset(clamped);
		return clamped;
	};

	const settle = () => {
		setSnapping(true);
		const next = applyOffset(Math.round(offsetRef.current));
		if (items[next] !== value) onChange(items[next]);
	};

	const settleRef = useRef(settle);
	const applyOffsetRef = useRef(applyOffset);

	useEffect(() => {
		disabledRef.current = disabled;
		settleRef.current = settle;
		applyOffsetRef.current = applyOffset;
	});

	useEffect(() => {
		setSnapping(true);
		applyOffsetRef.current(index);
	}, [index]);

	useEffect(() => {
		return () => {
			if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
		};
	}, []);

	useEffect(() => {
		const element = wheelRef.current;
		if (!element) return;
		const handleWheel = (event: WheelEvent) => {
			if (disabledRef.current) return;
			event.preventDefault();
			setSnapping(false);
			const delta = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaY / 100;
			applyOffsetRef.current(offsetRef.current + delta);
			if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
			settleTimer.current = window.setTimeout(() => settleRef.current(), 140);
		};
		element.addEventListener("wheel", handleWheel, { passive: false });
		return () => element.removeEventListener("wheel", handleWheel);
	}, []);

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (disabled || event.pointerType === "touch") return;
		event.preventDefault();
		dragRef.current = {
			active: true,
			startY: event.clientY,
			startOffset: offsetRef.current,
		};
		setSnapping(false);
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragRef.current.active) return;
		const delta = (event.clientY - dragRef.current.startY) / ITEM_HEIGHT;
		applyOffset(dragRef.current.startOffset - delta);
	};

	const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragRef.current.active) return;
		dragRef.current.active = false;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		settle();
	};

	return (
		<div
			ref={wheelRef}
			className={cn(
				"relative w-14 select-none overflow-hidden",
				disabled ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing"
			)}
			style={{ height: VISIBLE_ITEMS * ITEM_HEIGHT, touchAction: "none" }}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerEnd}
			onPointerCancel={handlePointerEnd}
		>
			<div
				className="will-change-transform"
				style={{
					transform: `translateY(${WHEEL_PADDING - offset * ITEM_HEIGHT}px)`,
					transition: snapping
						? `transform ${SNAP_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1)`
						: "none",
				}}
			>
				{items.map((item, itemIndex) => {
					const distance = Math.min(Math.abs(itemIndex - offset), 2);
					return (
						<div
							key={item}
							className="flex w-full items-center justify-center tabular-nums"
							style={{
								height: ITEM_HEIGHT,
								opacity: 1 - distance * 0.3,
								transform: `scale(${1 - distance * 0.06})`,
							}}
						>
							{pad2(item)}
						</div>
					);
				})}
			</div>
			<div
				className="pointer-events-none absolute inset-x-0.5 top-1/2 -translate-y-1/2 rounded-md border bg-accent/50"
				style={{ height: ITEM_HEIGHT }}
			/>
		</div>
	);
}

interface TimeWheelPickerProps {
	id: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

function TimeWheelPicker({ id, value, onChange, disabled }: TimeWheelPickerProps) {
	const [open, setOpen] = useState(false);
	const [focused, setFocused] = useState(false);
	const parsed = parseTimeInput(value) ?? "";
	const [text, setText] = useState(() => parsed);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setText(parsed);
	}, [parsed]);

	const commitText = () => {
		const next = parseTimeInput(text);
		if (next) {
			setText(next);
			if (next !== parsed) onChange(next);
		} else {
			setText(parsed);
		}
	};

	const setHour = (nextHour: number) => {
		onChange(`${pad2(nextHour)}${parsed.slice(2, 4) || "00"}`);
	};

	const setMinute = (nextMinute: number) => {
		onChange(`${parsed.slice(0, 2) || "00"}${pad2(nextMinute)}`);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) commitText();
			}}
		>
			<PopoverAnchor asChild>
				<Input
					ref={inputRef}
					id={id}
					value={focused ? digitsToDisplay(text) : hhmmToDisplay(value)}
					placeholder="19:00"
					inputMode="numeric"
					autoComplete="off"
					className="text-center"
					disabled={disabled}
					onChange={(event) => setText(event.target.value.replace(/\D/g, "").slice(0, 4))}
					onFocus={(event) => {
						setFocused(true);
						setText(parsed);
						event.currentTarget.select();
						if (!disabled) setOpen(true);
					}}
					onClick={() => {
						if (!disabled) setOpen(true);
					}}
					onBlur={() => {
						setFocused(false);
						commitText();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commitText();
							setOpen(false);
						} else if (event.key === "Escape") {
							setOpen(false);
						}
					}}
				/>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className="w-auto p-2"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onInteractOutside={(event) => {
					const target = event.detail.originalEvent.target;
					if (target instanceof Node && inputRef.current?.contains(target)) {
						event.preventDefault();
					}
				}}
			>
				<div className="flex items-center justify-center gap-1">
					<WheelColumn
						items={HOURS}
						value={Number(parsed.slice(0, 2) || 0)}
						onChange={setHour}
						disabled={disabled}
					/>
					<span className="text-muted-foreground">:</span>
					<WheelColumn
						items={MINUTES}
						value={Number(parsed.slice(2, 4) || 0)}
						onChange={setMinute}
						disabled={disabled}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}

type SemesterFormState = {
	name: string;
	start_date: string;
	default_seminar_weekday: number;
	default_seminar_start_time: string;
	default_seminar_end_time: string;
	default_seminar_tencent_id: string;
	default_seminar_tencent_link: string;
	weekly_report_app_token: string;
	weekly_report_table_id: string;
	weekly_report_url: string;
	seminar_app_token: string;
	seminar_table_id: string;
	seminar_url: string;
	seminar_leave_app_token: string;
	seminar_leave_table_id: string;
	seminar_leave_url: string;
	schedule_app_token: string;
	schedule_table_id: string;
	schedule_url: string;
};

const EMPTY_FORM: SemesterFormState = {
	name: "",
	start_date: "",
	default_seminar_weekday: 4,
	default_seminar_start_time: "1900",
	default_seminar_end_time: "2030",
	default_seminar_tencent_id: "",
	default_seminar_tencent_link: "",
	weekly_report_app_token: "",
	weekly_report_table_id: "",
	weekly_report_url: "",
	seminar_app_token: "",
	seminar_table_id: "",
	seminar_url: "",
	seminar_leave_app_token: "",
	seminar_leave_table_id: "",
	seminar_leave_url: "",
	schedule_app_token: "",
	schedule_table_id: "",
	schedule_url: "",
};

const BITABLE_FIELDS = [
	{ prefix: "seminar", label: "组会表" },
	{ prefix: "weekly_report", label: "周报表" },
	{ prefix: "seminar_leave", label: "请假表" },
	{ prefix: "schedule", label: "课表" },
] as const;

function fromSemester(semester: Semester): SemesterFormState {
	return {
		...EMPTY_FORM,
		name: semester.name,
		start_date: semester.start_date,
		default_seminar_weekday: semester.default_seminar_weekday,
		default_seminar_start_time: semester.default_seminar_start_time,
		default_seminar_end_time: semester.default_seminar_end_time,
		default_seminar_tencent_id: semester.default_seminar_tencent_id ?? "",
		default_seminar_tencent_link: semester.default_seminar_tencent_link ?? "",
		weekly_report_app_token: semester.weekly_report_app_token ?? "",
		weekly_report_table_id: semester.weekly_report_table_id ?? "",
		weekly_report_url: semester.weekly_report_url ?? "",
		seminar_app_token: semester.seminar_app_token ?? "",
		seminar_table_id: semester.seminar_table_id ?? "",
		seminar_url: semester.seminar_url ?? "",
		seminar_leave_app_token: semester.seminar_leave_app_token ?? "",
		seminar_leave_table_id: semester.seminar_leave_table_id ?? "",
		seminar_leave_url: semester.seminar_leave_url ?? "",
		schedule_app_token: semester.schedule_app_token ?? "",
		schedule_table_id: semester.schedule_table_id ?? "",
		schedule_url: semester.schedule_url ?? "",
	};
}

interface SemesterFormDialogProps {
	semester: Semester | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}

export function SemesterFormDialog({ semester, open, onOpenChange, onSaved }: SemesterFormDialogProps) {
	const [form, setForm] = useState<SemesterFormState>(EMPTY_FORM);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		setForm(semester ? fromSemester(semester) : EMPTY_FORM);
	}, [semester, open]);

	const patch = (partial: Partial<SemesterFormState>) => setForm((prev) => ({ ...prev, ...partial }));

	const save = async () => {
		if (!form.name.trim()) {
			toast.error("学期名称不能为空。");
			return;
		}
		if (!form.start_date) {
			toast.error("请填写开学日期（第 1 周周一）。");
			return;
		}
		const startTime = parseTimeInput(form.default_seminar_start_time);
		if (!startTime) {
			toast.error("开始时间格式不正确，请填写 0-23 时、0-59 分。");
			return;
		}
		const endTime = parseTimeInput(form.default_seminar_end_time);
		if (!endTime) {
			toast.error("结束时间格式不正确，请填写 0-23 时、0-59 分。");
			return;
		}
		if (startTime >= endTime) {
			toast.error("结束时间必须晚于开始时间。");
			return;
		}
		const payload = {
			...form,
			name: form.name.trim(),
			default_seminar_start_time: startTime,
			default_seminar_end_time: endTime,
			default_seminar_tencent_id: form.default_seminar_tencent_id || null,
			default_seminar_tencent_link: form.default_seminar_tencent_link || null,
		};
		setIsSaving(true);
		try {
			if (semester) {
				await updateSemester(semester.id, payload);
			} else {
				await createSemester(payload);
			}
			toast.success(semester ? "学期已更新。" : "学期已创建。");
			onOpenChange(false);
			onSaved();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存学期失败。");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{semester ? "编辑学期" : "新建学期"}</DialogTitle>
					<DialogDescription>
						学期参数与四张飞书多维表信息，同步与预告推送都依赖这里。
					</DialogDescription>
				</DialogHeader>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="semester-name">学期名称</Label>
						<Input
							id="semester-name"
							value={form.name}
							onChange={(event) => patch({ name: event.target.value })}
							placeholder="如：2026-Fall"
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="semester-start">开学日期（第 1 周周一）</Label>
						<Input
							id="semester-start"
							type="date"
							value={form.start_date}
							onChange={(event) => patch({ start_date: event.target.value })}
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label>默认组会星期</Label>
						<Select
							value={String(form.default_seminar_weekday)}
							onValueChange={(value) => patch({ default_seminar_weekday: Number(value) })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{WEEKDAY_NAMES.map((label, index) => (
									<SelectItem key={label} value={String(index + 1)}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="seminar-start-time">开始时间</Label>
							<TimeWheelPicker
								id="seminar-start-time"
								value={form.default_seminar_start_time}
								onChange={(value) => patch({ default_seminar_start_time: value })}
								disabled={isSaving}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="seminar-end-time">结束时间</Label>
							<TimeWheelPicker
								id="seminar-end-time"
								value={form.default_seminar_end_time}
								onChange={(value) => patch({ default_seminar_end_time: value })}
								disabled={isSaving}
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="tencent-id">腾讯会议号</Label>
						<Input
							id="tencent-id"
							value={form.default_seminar_tencent_id}
							onChange={(event) => patch({ default_seminar_tencent_id: event.target.value })}
							disabled={isSaving}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="tencent-link">腾讯会议链接</Label>
						<Input
							id="tencent-link"
							value={form.default_seminar_tencent_link}
							onChange={(event) => patch({ default_seminar_tencent_link: event.target.value })}
							disabled={isSaving}
						/>
					</div>
				</div>

				<div className="space-y-4">
					<Label>飞书多维表</Label>
					{BITABLE_FIELDS.map(({ prefix, label }) => (
						<div key={prefix} className="grid grid-cols-1 gap-3 rounded-md border p-4 sm:grid-cols-3">
							<div className="space-y-2 sm:col-span-3">
								<Label className="text-xs text-muted-foreground">{label}</Label>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`${prefix}-app-token`}>app_token</Label>
								<Input
									id={`${prefix}-app-token`}
									value={form[`${prefix}_app_token` as keyof SemesterFormState] as string}
									onChange={(event) =>
										patch({ [`${prefix}_app_token`]: event.target.value } as Partial<SemesterFormState>)
									}
									disabled={isSaving}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`${prefix}-table-id`}>table_id</Label>
								<Input
									id={`${prefix}-table-id`}
									value={form[`${prefix}_table_id` as keyof SemesterFormState] as string}
									onChange={(event) =>
										patch({ [`${prefix}_table_id`]: event.target.value } as Partial<SemesterFormState>)
									}
									disabled={isSaving}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`${prefix}-url`}>链接</Label>
								<Input
									id={`${prefix}-url`}
									value={form[`${prefix}_url` as keyof SemesterFormState] as string}
									onChange={(event) =>
										patch({ [`${prefix}_url`]: event.target.value } as Partial<SemesterFormState>)
									}
									disabled={isSaving}
								/>
							</div>
						</div>
					))}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
						取消
					</Button>
					<Button onClick={save} disabled={isSaving}>
						{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						保存
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
