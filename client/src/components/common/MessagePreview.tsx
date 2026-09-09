import { PostMessage } from "@/lib/schema";

interface MessageElement {
	tag?: string;
	text?: string;
	href?: string;
	style?: string[];
}

function renderElement(element: MessageElement, index: number) {
	const bold = element.style?.includes("bold");
	const underline = element.style?.includes("underline");

	if (element.tag === "a") {
		return (
			<a
				key={index}
				href={element.href}
				target="_blank"
				rel="noreferrer"
				className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
			>
				{element.text}
			</a>
		);
	}

	return (
		<span
			key={index}
			className={[
				bold ? "font-semibold" : "",
				underline ? "underline underline-offset-2" : "",
			].join(" ")}
		>
			{element.text}
		</span>
	);
}

/** Read-only preview of a rendered Feishu post payload. */
export function MessagePreview({ message }: { message: PostMessage }) {
	return (
		<div className="space-y-3 rounded-md border bg-muted/30 p-4">
			<p className="font-semibold">{message.zh_cn.title}</p>
			<div className="space-y-2 text-sm leading-relaxed">
				{message.zh_cn.content.map((paragraph, paragraphIndex) => (
					<p key={paragraphIndex} className="whitespace-pre-wrap">
						{(paragraph as MessageElement[]).map(renderElement)}
					</p>
				))}
			</div>
		</div>
	);
}
