"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { searchRecipients } from "@/lib/api";
import type { Recipient } from "@/lib/schema";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 250;

interface RecipientPickerProps {
	value: Recipient | null;
	onChange: (recipient: Recipient | null) => void;
	disabled?: boolean;
	placeholder?: string;
}

/**
 * Combobox that pushes to a lab member by name, or reuses a recent target.
 * An empty query lists the latest pushes; typing searches member names.
 */
export function RecipientPicker({
	value,
	onChange,
	disabled = false,
	placeholder = "搜索姓名或选择最近发送",
}: RecipientPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [recipients, setRecipients] = useState<Recipient[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const requestId = useRef(0);

	useEffect(() => {
		if (!open) return;
		const current = requestId.current + 1;
		requestId.current = current;
		const trimmed = query.trim();
		setIsLoading(true);
		const timer = setTimeout(
			() => {
				searchRecipients(trimmed)
					.then((response) => {
						if (requestId.current === current) setRecipients(response.recipients);
					})
					.catch((error) => {
						console.error("搜索接收者失败", error);
						if (requestId.current === current) setRecipients([]);
					})
					.finally(() => {
						if (requestId.current === current) setIsLoading(false);
					});
			},
			trimmed ? SEARCH_DEBOUNCE_MS : 0,
		);
		return () => clearTimeout(timer);
	}, [open, query]);

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) setQuery("");
	};

	const select = (recipient: Recipient | null) => {
		onChange(recipient);
		setOpen(false);
	};

	const isSearching = query.trim().length > 0;

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"w-full justify-between font-normal",
						!value && "text-muted-foreground",
					)}
				>
					<span className="truncate">{value ? value.name : placeholder}</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-(--radix-popover-trigger-width) p-0"
			>
				<Command shouldFilter={false}>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="输入姓名搜索成员"
					/>
					<CommandList>
						{isLoading ? (
							<div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								正在搜索...
							</div>
						) : recipients.length === 0 ? (
							<CommandEmpty>
								{isSearching ? "没有匹配的成员。" : "还没有最近发送记录。"}
							</CommandEmpty>
						) : (
							<CommandGroup heading={isSearching ? "匹配成员" : "最近发送"}>
								{recipients.map((recipient) => (
									<CommandItem
										key={`${recipient.kind}:${recipient.receive_id}`}
										value={`${recipient.kind}:${recipient.receive_id}`}
										onSelect={() => select(recipient)}
									>
										<Check
											className={cn(
												"h-4 w-4",
												value?.receive_id === recipient.receive_id
													? "opacity-100"
													: "opacity-0",
											)}
										/>
										<span className="truncate">{recipient.name}</span>
										{recipient.kind === "chat" ? (
											<span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
												群
											</span>
										) : null}
										{recipient.subtitle ? (
											<span className="ml-auto truncate pl-2 text-xs text-muted-foreground">
												{recipient.subtitle}
											</span>
										) : null}
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{value && !isSearching ? (
							<CommandGroup>
								<CommandItem value="__clear__" onSelect={() => select(null)}>
									清除已选接收者
								</CommandItem>
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
