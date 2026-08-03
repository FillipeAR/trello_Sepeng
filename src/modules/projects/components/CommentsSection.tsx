"use client";

import { useActionState, useRef, useState } from "react";
import { createCommentAction, type ActionState } from "@/app/(app)/obras/actions";
import { formatDateTime } from "@/lib/format";

const initial: ActionState = {};

export interface CommentData {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
  mentions: { user: { id: string; name: string } }[];
}

export interface MemberOption {
  id: string;
  name: string;
}

function CommentRow({ comment }: { comment: CommentData }) {
  return (
    <li className="border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span className="font-medium text-foreground">{comment.author.name}</span>
        <span>{formatDateTime(comment.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
      {comment.mentions.length > 0 ? (
        <p className="mt-1 text-xs text-muted">
          Marcou: {comment.mentions.map((m) => m.user.name).join(", ")}
        </p>
      ) : null}
    </li>
  );
}

function NewCommentForm({ projectId, members }: { projectId: string; members: MemberOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createCommentAction(prev, formData);
    if (result.success) {
      formRef.current?.reset();
      setMentionIds([]);
    }
    return result;
  }, initial);

  function addMention(userId: string) {
    const member = members.find((m) => m.id === userId);
    if (!member || mentionIds.includes(userId)) return;
    setMentionIds((ids) => [...ids, userId]);

    const textarea = textareaRef.current;
    if (textarea) {
      const before = textarea.value;
      const needsSpace = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
      textarea.value = `${before}${needsSpace ? " " : ""}@${member.name} `;
      textarea.focus();
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      {mentionIds.map((id) => (
        <input key={id} type="hidden" name="mentionUserIds" value={id} />
      ))}

      <textarea
        ref={textareaRef}
        name="body"
        rows={3}
        required
        placeholder="Escreva um comentário — use @ pra marcar alguém"
        className="input"
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addMention(e.target.value);
          }}
          className="input w-auto text-xs"
        >
          <option value="">+ Marcar alguém…</option>
          {members
            .filter((m) => !mentionIds.includes(m.id))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>

        {mentionIds.length > 0 ? (
          <span className="text-xs text-muted">
            Marcando: {mentionIds.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean).join(", ")}
          </span>
        ) : null}

        <button type="submit" disabled={pending} className="btn-ghost ml-auto text-xs">
          {pending ? "Enviando…" : "Comentar"}
        </button>
      </div>

      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
    </form>
  );
}

export function CommentsSection({
  projectId,
  comments,
  members,
}: {
  projectId: string;
  comments: CommentData[];
  members: MemberOption[];
}) {
  return (
    <section className="card p-6">
      <h2 className="mb-3 text-sm font-semibold">Comentários ({comments.length})</h2>

      {comments.length > 0 ? (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">Nenhum comentário ainda.</p>
      )}

      <NewCommentForm projectId={projectId} members={members} />
    </section>
  );
}
