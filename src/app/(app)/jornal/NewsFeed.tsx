"use client";

import { useActionState, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";
import {
  createNewsPostAction,
  deleteNewsPostAction,
  updateNewsPostAction,
  type ActionState,
} from "./actions";

const initial: ActionState = {};

export interface NewsPostData {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  publishedAt: Date;
  authorName: string;
}

function EditPostForm({ post, onDone }: { post: NewsPostData; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateNewsPostAction(prev, formData);
    if (result.success) onDone();
    return result;
  }, initial);

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <input type="hidden" name="newsPostId" value={post.id} />
      <input type="hidden" name="existingImageUrl" value={post.imageUrl ?? ""} />
      <input name="title" required defaultValue={post.title} className="input" />
      <textarea name="body" required rows={4} defaultValue={post.body} className="input" />
      <div>
        <label className="label">Trocar imagem (opcional)</label>
        <input name="image" type="file" accept="image/*" className="input file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium" />
      </div>
      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary text-xs">
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function PostCard({ post, canManage }: { post: NewsPostData; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [deleteState, deleteAction] = useActionState(deleteNewsPostAction, initial);

  if (editing) {
    return (
      <li className="card p-5">
        <EditPostForm post={post} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="card overflow-hidden p-0">
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imageUrl} alt={post.title} className="h-56 w-full object-cover" />
      ) : null}
      <div className="p-5">
        <h2 className="text-base font-semibold">{post.title}</h2>
        <p className="mt-1 text-xs text-muted">
          {post.authorName} · {formatDateTime(post.publishedAt)}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm">{post.body}</p>

        {canManage ? (
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted hover:text-primary">
              Editar
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="newsPostId" value={post.id} />
              <button
                type="submit"
                onClick={(e) => {
                  if (!window.confirm(`Remover a notícia "${post.title}"?`)) e.preventDefault();
                }}
                className="text-xs text-muted hover:text-danger"
              >
                Excluir
              </button>
            </form>
            {deleteState.errors?.length ? <p className="text-xs text-danger">{deleteState.errors.join(" ")}</p> : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function NewPostForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await createNewsPostAction(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initial);

  return (
    <form ref={formRef} action={formAction} className="card space-y-3 p-5">
      <h2 className="text-sm font-semibold">Publicar notícia</h2>
      <input name="title" required placeholder="Título" className="input" />
      <textarea name="body" required rows={4} placeholder="Escreva a notícia…" className="input" />
      <div>
        <label className="label">Imagem de capa (opcional)</label>
        <input
          name="image"
          type="file"
          accept="image/*"
          className="input file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
      </div>
      {state.errors?.length ? <p className="text-xs text-danger">{state.errors.join(" ")}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary text-sm">
        {pending ? "Publicando…" : "Publicar"}
      </button>
    </form>
  );
}

export function NewsFeed({ posts, canManage }: { posts: NewsPostData[]; canManage: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        {posts.length === 0 ? (
          <div className="card p-10 text-center text-sm text-muted">
            Nenhuma notícia publicada ainda.
          </div>
        ) : (
          <ul className="space-y-5">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} canManage={canManage} />
            ))}
          </ul>
        )}
      </div>

      {canManage ? (
        <div>
          <NewPostForm />
        </div>
      ) : null}
    </div>
  );
}
