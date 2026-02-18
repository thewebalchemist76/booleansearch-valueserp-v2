-- Esegui questo script in Supabase Dashboard → SQL Editor per abilitare "Tutte le ricerche"
-- (tabella search_exports + bucket Storage + RLS)

-- 1) Tabella search_exports
create table if not exists public.search_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_name text,
  file_name text not null,
  file_path text not null,
  article_count int,
  domain_count int,
  search_summary text,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_exports_project_id on public.search_exports(project_id);
create index if not exists idx_search_exports_user_id on public.search_exports(user_id);
create index if not exists idx_search_exports_created_at on public.search_exports(created_at desc);

alter table public.search_exports enable row level security;

-- RLS: l'utente vede solo export dei progetti di cui è member (owner o member)
create policy "search_exports_select" on public.search_exports
  for select
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = search_exports.project_id and pm.user_id = auth.uid()
    )
  );

-- RLS: l'utente può inserire solo se è member del progetto
create policy "search_exports_insert" on public.search_exports
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = search_exports.project_id and pm.user_id = auth.uid()
    )
  );

-- 2) Storage bucket "search-exports"
-- Crea il bucket dalla Dashboard: Storage → New bucket → nome "search-exports", Private.
-- Poi in Storage → search-exports → Policies aggiungi:

-- Policy "Utenti possono caricare nel proprio path" (INSERT):
-- (bucket_id = 'search-exports') and (auth.uid()::text = (storage.foldername(name))[1])

-- Policy "Utenti possono leggere file dei progetti di cui sono member" (SELECT):
-- Serve una policy che permetta la lettura: ad es. chi è autenticato può leggere
-- (per signed URL il client usa auth, quindi):
-- (bucket_id = 'search-exports') and auth.role() = 'authenticated'

-- Se preferisci policy più restrittive puoi usare una Edge Function per generare signed URL
-- controllando project_members. Per semplicità qui consentiamo read a tutti gli autenticati
-- dato che la tabella search_exports ha RLS e la lista filtra già per progetto.

-- In alternativa, crea le policy da SQL (Storage policies):
insert into storage.buckets (id, name, public)
values ('search-exports', 'search-exports', false)
on conflict (id) do nothing;

create policy "search_exports_upload" on storage.objects
  for insert
  with check (
    bucket_id = 'search-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "search_exports_read" on storage.objects
  for select
  using (bucket_id = 'search-exports' and auth.role() = 'authenticated');
