-- Órbita: armazenamento de documentos por usuário (equivalente à base do claude.ai)
create table if not exists public.docs (
  path text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists docs_user_parent on public.docs (user_id, parent);
alter table public.docs enable row level security;

drop policy if exists "docs_select_own" on public.docs;
drop policy if exists "docs_insert_own" on public.docs;
drop policy if exists "docs_update_own" on public.docs;
drop policy if exists "docs_delete_own" on public.docs;
create policy "docs_select_own" on public.docs for select using (user_id = auth.uid());
create policy "docs_insert_own" on public.docs for insert with check (user_id = auth.uid() and path like 'data/users/' || auth.uid()::text || '/%');
create policy "docs_update_own" on public.docs for update using (user_id = auth.uid()) with check (user_id = auth.uid() and path like 'data/users/' || auth.uid()::text || '/%');
create policy "docs_delete_own" on public.docs for delete using (user_id = auth.uid());
