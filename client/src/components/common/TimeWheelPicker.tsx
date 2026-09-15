"use client";

// The "HHMM" time picker: a text input that also opens a two-column wheel for
// hours and minutes. Extracted from the semester settings dialog so the seminar
// editor can reuse the exact same control and input parsing.

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import { cn, formatHhmm } from "@/lib/utils";

const ITEM_HEIGHT = 32;
const VISIBLE_ITEMS = 5;
const WHEEL_PADDING = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT;
const SNAP_DURATION = 150;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

/** Parse user-typed time ("19", "1900", "19:00", "19：00", "19.00") into "HHMM"; null when invalid. */
export function parseTimeInput(raw: string): string | null {
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

export function TimeWheelPicker({ id, value, onChange, disabled }: TimeWheelPickerProps) {
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
					value={focused ? digitsToDisplay(text) : formatHhmm(value)}
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
