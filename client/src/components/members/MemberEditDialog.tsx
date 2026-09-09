"use client";

import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { updateMember } from "@/lib/api";
import { Member } from "@/lib/schema";
import { toast } from "sonner";

const EDITABLE_FIELDS = [
	{ key: "name", label: "姓名" },
	{ key: "grade", label: "年级" },
	{ key: "advisor", label: "导师" },
	{ key: "cultivation_type", label: "培养类型" },
	{ key: "enrollment_status", label: "在读情况" },
	{ key: "student_id", label: "学号" },
	{ key: "email", label: "邮箱" },
	{ key: "mobile", label: "手机" },
	{ key: "department", label: "部门" },
	{ key: "feishu_account", label: "飞书 open_id" },
] as const;

type EditableKey = (typeof EDITABLE_FIELDS)[number]["key"];

interface MemberEditDialogProps {
	member: Member | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}

export function MemberEditDialog({ member, open, onOpenChange, onSaved }: MemberEditDialogProps) {
	const [values, setValues] = useState<Record<EditableKey, string>>({} as Record<EditableKey, string>);
	const [needAttendance, setNeedAttendance] = useState(false);
	const [isActive, setIsActive] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!member) return;
		setValues(
			Object.fromEntries(
				EDITABLE_FIELDS.map((field) => [field.key, member[field.key] ?? ""]),
			) as Record<EditableKey, string>,
		);
		setNeedAttendance(member.need_attendance);
		setIsActive(member.is_active);
	}, [member]);

	const save = async () => {
		if (!member) return;
		if (!values.name.trim()) {
			toast.error("姓名不能为空。");
			return;
		}
		setIsSaving(true);
		try {
			await updateMember(member.id, {
				...values,
				name: values.name.trim(),
				need_attendance: needAttendance,
				is_active: isActive,
			});
			toast.success("已保存成员信息。");
			onOpenChange(false);
			onSaved();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "保存失败。");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>编辑成员</DialogTitle>
					<DialogDescription>修改后保存即可，飞书同步会以这里的值为主数据。</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{EDITABLE_FIELDS.map((field) => (
						<div key={field.key} className="space-y-2">
							<Label htmlFor={field.key}>{field.label}</Label>
							<Input
								id={field.key}
								value={values[field.key] ?? ""}
								onChange={(event) =>
									setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
								}
								disabled={isSaving}
							/>
						</div>
					))}
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
					<div className="flex items-center gap-2">
						<Switch
							id="edit-need-attendance"
							checked={needAttendance}
							onCheckedChange={setNeedAttendance}
						/>
						<Label htmlFor="edit-need-attendance">需要考勤</Label>
					</div>
					<div className="flex items-center gap-2">
						<Switch id="edit-is-active" checked={isActive} onCheckedChange={setIsActive} />
						<Label htmlFor="edit-is-active">在册</Label>
					</div>
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
