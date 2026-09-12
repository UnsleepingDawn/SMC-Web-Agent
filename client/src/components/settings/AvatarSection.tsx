"use client"

import { useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/sidebar/UserMenuContent";
import { deleteAvatar, uploadAvatar } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getCroppedSquareBlob, type CropArea } from "@/lib/cropImage";
import { toast } from "sonner";

const MAX_ZOOM = 3;

export function AvatarSection() {
	const { user, refreshUser } = useAuth();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [imageSrc, setImageSrc] = useState<string | null>(null);
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [croppedArea, setCroppedArea] = useState<CropArea | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);

	const isBusy = isUploading || isRemoving;

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		// Clear the value so picking the same file again still fires onChange.
		e.target.value = "";
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error("请选择图片文件。");
			return;
		}
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			setCrop({ x: 0, y: 0 });
			setZoom(1);
			setCroppedArea(null);
			setImageSrc(String(reader.result));
		});
		reader.readAsDataURL(file);
	};

	const closeDialog = () => {
		setImageSrc(null);
	};

	const handleConfirm = async () => {
		if (!imageSrc || !croppedArea) return;
		setIsUploading(true);
		try {
			const blob = await getCroppedSquareBlob(imageSrc, croppedArea);
			await uploadAvatar(blob);
			await refreshUser();
			toast.success("头像已更新。");
			closeDialog();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "头像更新失败。");
		} finally {
			setIsUploading(false);
		}
	};

	const handleRemove = async () => {
		setIsRemoving(true);
		try {
			await deleteAvatar();
			await refreshUser();
			toast.success("头像已移除。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "移除头像失败。");
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>头像</CardTitle>
				<CardDescription>上传一张图片，裁剪为正方形后作为你的头像。</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center gap-4">
				{user ? (
					<UserAvatar user={user} className="h-16 w-16 shrink-0" iconSize={32} />
				) : null}
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => fileInputRef.current?.click()}
						disabled={isBusy}
					>
						{isUploading ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Upload className="mr-2 h-4 w-4" />
						)}
						上传头像
					</Button>
					{user?.avatar_url ? (
						<Button type="button" variant="ghost" onClick={handleRemove} disabled={isBusy}>
							{isRemoving ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Trash2 className="mr-2 h-4 w-4" />
							)}
							移除头像
						</Button>
					) : null}
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					className="hidden"
					onChange={handleFileChange}
				/>
			</CardContent>

			<Dialog
				open={imageSrc !== null}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>裁剪头像</DialogTitle>
						<DialogDescription>拖动图片调整位置，滚动或使用滑杆缩放。</DialogDescription>
					</DialogHeader>
					{imageSrc ? (
						<div className="space-y-4">
							<div className="relative h-72 w-full overflow-hidden rounded-md bg-muted">
								<Cropper
									image={imageSrc}
									crop={crop}
									zoom={zoom}
									aspect={1}
									cropShape="round"
									showGrid={false}
									onCropChange={setCrop}
									onZoomChange={setZoom}
									onCropComplete={(_area, areaPixels) => setCroppedArea(areaPixels)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="avatar-zoom">缩放</Label>
								<input
									id="avatar-zoom"
									type="range"
									min={1}
									max={MAX_ZOOM}
									step={0.01}
									value={zoom}
									onChange={(e) => setZoom(Number(e.target.value))}
									className="w-full cursor-pointer accent-primary"
								/>
							</div>
						</div>
					) : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={closeDialog} disabled={isUploading}>
							取消
						</Button>
						<Button
							type="button"
							onClick={handleConfirm}
							disabled={isUploading || !croppedArea}
						>
							{isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							确认
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
