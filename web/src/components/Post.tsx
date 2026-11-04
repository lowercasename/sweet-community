import { useState } from "react";
import type { Post as PostData, User } from "../api";
import { postExtensions } from "../editor/extensions";
import {
	Avatar,
	Button,
	Card,
	ConfirmDialog,
	HtmlContent,
	Menu,
	Row,
	Stack,
	Text,
	Time,
	type MenuItem,
} from "../ui";
import { BodyEditor } from "./BodyEditor";
import { CommentThread } from "./CommentThread";

interface PostProps {
	post: PostData;
	me: User;
	/** True while offline; disables saving. */
	disabled: boolean;
	/** Resolves when the server has stored the new body. */
	onEdit: (bodyHtml: string) => Promise<void>;
	/** Resolves when the server has deleted the post; the parent drops it from the list. */
	onDelete: () => Promise<void>;
}

export function Post({ post, me, disabled, onEdit, onDelete }: PostProps) {
	const [editing, setEditing] = useState(false);
	const [open, setOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const mine = post.author.id === me.id;

	const save = async (bodyHtml: string) => {
		await onEdit(bodyHtml);
		setEditing(false);
	};

	const remove = async () => {
		setDeleting(true);
		setDeleteError(null);
		try {
			await onDelete();
		} catch (e) {
			setDeleteError(
				e instanceof Error ? e.message : "Could not delete the post",
			);
			setConfirming(false);
		} finally {
			setDeleting(false);
		}
	};

	// The author edits and deletes; the owner may delete anything.
	const items: MenuItem[] = [];
	if (mine)
		items.push({
			label: "Edit",
			icon: "pencil",
			onSelect: () => setEditing(true),
		});
	if (mine || me.role === "owner")
		items.push({
			label: "Delete",
			icon: "trash",
			onSelect: () => setConfirming(true),
		});

	return (
		<Card as="article">
			<Stack gap={2}>
				<Row justify="between" align="center">
					<Row gap={2} align="center">
						<Avatar name={post.author.username} picture={post.author.picture} />
						<Text as="span" variant="name">
							{post.author.username}
						</Text>
						<Text as="span" variant="small">
							<Time at={post.created_at} />
							{post.edited_at != null && (
								<>
									{" · edited "}
									<Time at={post.edited_at} />
								</>
							)}
						</Text>
					</Row>
					{items.length > 0 && !editing && !disabled && (
						<Menu label="Post options" items={items} />
					)}
				</Row>
				{editing ? (
					// The stored HTML is the editor's input: no separate document format.
					<BodyEditor
						key={post.edited_at ?? 0}
						extensions={postExtensions}
						size="post"
						submitLabel="Save"
						busyLabel="Saving…"
						initialHtml={post.body_html}
						disabled={disabled}
						onSubmit={save}
						onCancel={() => setEditing(false)}
					/>
				) : (
					<HtmlContent html={post.body_html} />
				)}
				{deleteError && <Text variant="secondary">{deleteError}</Text>}
				<Row>
					<Button
						variant="ghost"
						icon="comment"
						count={post.comment_count}
						label={open ? "Hide comments" : "Show comments"}
						pressed={open}
						onClick={() => setOpen((o) => !o)}
					/>
				</Row>
				{open && <CommentThread postId={post.id} me={me} disabled={disabled} />}
			</Stack>
			<ConfirmDialog
				open={confirming}
				title="Delete this post?"
				confirmLabel={deleting ? "Deleting…" : "Delete"}
				busy={deleting}
				onConfirm={() => void remove()}
				onClose={() => setConfirming(false)}
			>
				<Text variant="secondary">
					This will also delete all the comments made on this post. This action
					cannot be undone.
				</Text>
			</ConfirmDialog>
		</Card>
	);
}
