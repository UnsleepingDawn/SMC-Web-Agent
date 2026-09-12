"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SemesterFormDialog } from "@/components/settings/SemesterFormDialog";
import { useSemesters } from "@/hooks/useSemesters";
import { useCurrentSemester } from "@/hooks/useCurrentSemester";
import { deleteSemester } from "@/lib/api";
import { Semester, WEEKDAY_NAMES } from "@/lib/schema";
import { formatHhmm } from "@/lib/utils";
import { toast } from "sonner";

export function SemesterSection() {
	const { semesters, isLoading, refetch } = useSemesters();
	const { semester: current, refetch: refetchCurrent } = useCurrentSemester();
	const [editing, setEditing] = useState<Semester | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<Semester | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const refresh = () => {
		refetch();
		refetchCurrent();
	};

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		setIsDeleting(true);
		try {
			await deleteSemester(pendingDelete.id);
			toast.success("学期已删除。");
			setPendingDelete(null);
			refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "删除学期失败。");
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="space-y-1">
						<CardTitle>学期管理</CardTitle>
						<CardDescription>每学期的起始日期与多维表配置。</CardDescription>
					</div>
					<Button
						onClick={() => {
							setEditing(null);
							setDialogOpen(true);
						}}
					>
						<Plus className="mr-2 h-4 w-4" />
						新建学期
					</Button>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						正在加载...
					</div>
				) : semesters.length === 0 ? (
					<p className="text-sm text-muted-foreground">还没有学期，先新建一个。</p>
				) : (
					semesters.map((item) => (
						<div
							key={item.id}
							className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="space-y-1">
								<div className="flex items-center gap-2">
									<span className="font-medium">{item.name}</span>
									{current?.id === item.id ? (
										<Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
											当前
										</Badge>
									) : null}
								</div>
								<p className="text-xs text-muted-foreground">
								起始 {item.start_date} · 默认{" "}
								{WEEKDAY_NAMES[item.default_seminar_weekday - 1] ?? ""}{" "}
								{formatHhmm(item.default_seminar_start_time)}-
								{formatHhmm(item.default_seminar_end_time)}
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										setEditing(item);
										setDialogOpen(true);
									}}
								>
									<Pencil className="mr-2 h-4 w-4" />
									编辑
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setPendingDelete(item)}
								>
									<Trash2 className="mr-2 h-4 w-4" />
									删除
								</Button>
							</div>
						</div>
					))
				)}
			</CardContent>

			<SemesterFormDialog
				semester={editing}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSaved={refresh}
			/>

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) setPendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>删除学期「{pendingDelete?.name}」？</AlertDialogTitle>
						<AlertDialogDescription>
							该学期下的组会、周报记录会一并删除，此操作不可撤销。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault();
								confirmDelete();
							}}
							disabled={isDeleting}
						>
							{isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							确认删除
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
