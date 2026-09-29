"use client";

import type { ReactNode } from "react";

/**
 * Layout blocks shared by the exported posters.
 *
 * The posters are fixed-width canvases where every size is an explicit px, so
 * the same two blocks would otherwise be copy-pasted into each one. Keeping
 * them here means the section headings and stat pills cannot drift apart.
 */

/** A titled block of the poster, separated from the previous one by a rule. */
export function PosterSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="space-y-[28px] border-t border-border pt-[40px]">
			<h2 className="flex items-center gap-[16px] text-[40px] leading-none font-bold">
				<span className="inline-block h-[36px] w-[8px] rounded bg-foreground" />
				{title}
			</h2>
			{children}
		</section>
	);
}

/** One headline figure of a poster, e.g. `应到 47`. */
export function PosterStatPill({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: number;
	valueClassName?: string;
}) {
	return (
		<div className="min-w-[180px] rounded-[16px] bg-secondary px-[28px] py-[18px]">
			<p className="text-[26px] text-muted-foreground">{label}</p>
			<p className={`text-[44px] leading-tight font-bold tabular-nums ${valueClassName ?? ""}`}>
				{value}
			</p>
		</div>
	);
}
